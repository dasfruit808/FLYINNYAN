import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

const kv = await Deno.openKv();

interface ScorePayload {
    playerName: string;
    deviceId: string;
    clientSubmissionId?: string;
    score: number;
    timeMs: number;
    bestStreak?: number;
    nyan?: number;
    recordedAt?: number;
}

function sanitizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').replace(/[^A-Za-z0-9 _\-]/g, '').slice(0, 24) || 'Ace Pilot';
}

function clampNumber(value: unknown, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(Math.max(Math.floor(numeric), min), max);
}

function getWeekStart(timestamp: number): Date {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const diff = (day + 6) % 7; // Monday start
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - diff);
    start.setUTCHours(0, 0, 0, 0);
    return start;
}

async function enforceRateLimit(identifier: string, limit = 10, windowMs = 60_000) {
    if (!identifier) {
        return { allowed: true };
    }
    const now = Date.now();
    const windowKey = Math.floor(now / windowMs);
    const key = ['rate-limit', identifier, windowKey];
    const entry = await kv.get<{ count: number }>(key);
    const count = (entry.value?.count ?? 0) + 1;
    if (count > limit) {
        const retryAt = (windowKey + 1) * windowMs;
        return { allowed: false, retryAt };
    }
    const ttl = windowMs - (now % windowMs);
    await kv.set(key, { count }, { expireIn: ttl });
    return { allowed: true };
}

async function fetchLeaderboard(scope: 'global' | 'weekly') {
    const baseQuery = supabase
        .from('scores')
        .select('player_name, score, time_ms, best_streak, nyan, recorded_at', { head: false })
        .order('score', { ascending: false })
        .order('time_ms', { ascending: false })
        .order('recorded_at', { ascending: true })
        .limit(50);

    if (scope === 'weekly') {
        const startOfWeek = getWeekStart(Date.now()).toISOString();
        baseQuery.gte('recorded_at', startOfWeek);
    }

    const { data, error } = await baseQuery;
    if (error) {
        throw error;
    }
    return (data ?? []).map((row) => ({
        player: row.player_name,
        score: row.score,
        timeMs: row.time_ms,
        bestStreak: row.best_streak ?? 0,
        nyan: row.nyan ?? 0,
        recordedAt: new Date(row.recorded_at).getTime()
    }));
}

async function computePlacement(score: number, timeMs: number, recordedAt: number) {
    const isoRecordedAt = new Date(recordedAt).toISOString();
    const filters = [
        `score.gt.${score}`,
        `and(score.eq.${score},time_ms.gt.${timeMs})`,
        `and(score.eq.${score},time_ms.eq.${timeMs},recorded_at.lt.${isoRecordedAt})`
    ];
    const { count, error } = await supabase
        .from('scores')
        .select('id', { head: true, count: 'exact' })
        .or(filters.join(','));
    if (error) {
        throw error;
    }
    if (typeof count !== 'number') {
        return null;
    }
    return count + 1;
}

async function handleSubmit(request: Request) {
    let body: ScorePayload;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
            status: 400,
            headers: corsHeaders
        });
    }
    const playerName = sanitizeName(body.playerName);
    const deviceId = (body.deviceId ?? '').trim().slice(0, 64);
    if (!deviceId) {
        return new Response(JSON.stringify({ error: 'Missing device identifier.' }), {
            status: 400,
            headers: corsHeaders
        });
    }

    const score = clampNumber(body.score);
    const timeMs = clampNumber(body.timeMs);
    if (score <= 0 || timeMs <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid score payload.' }), {
            status: 400,
            headers: corsHeaders
        });
    }
    const bestStreak = clampNumber(body.bestStreak, { max: 9999 });
    const nyan = clampNumber(body.nyan, { max: 1_000_000 });
    const recordedAt = clampNumber(body.recordedAt ?? Date.now(), { min: 0 });

    const ipAddress =
        request.headers.get('x-forwarded-for') ??
        request.headers.get('cf-connecting-ip') ??
        request.headers.get('x-real-ip') ??
        deviceId;

    const rateLimitId = `${deviceId}:${ipAddress}`;
    const limit = await enforceRateLimit(rateLimitId, 12, 60_000);
    if (!limit.allowed) {
        return new Response(
            JSON.stringify({
                error: 'Rate limit exceeded. Try again shortly.'
            }),
            { status: 429, headers: corsHeaders }
        );
    }

    const weekStart = getWeekStart(recordedAt).toISOString();
    const recordedIso = new Date(recordedAt).toISOString();

    const existing = await supabase
        .from('scores')
        .select('id, score, time_ms, recorded_at')
        .eq('device_id', deviceId)
        .maybeSingle();

    if (existing.error && existing.error.code !== 'PGRST116') {
        throw existing.error;
    }

    if (existing.data) {
        const current = existing.data;
        const betterScore = current.score > score;
        const equalScoreBetterTime = current.score === score && current.time_ms >= timeMs;
        if (betterScore || equalScoreBetterTime) {
            const leaderboards = {
                global: await fetchLeaderboard('global'),
                weekly: await fetchLeaderboard('weekly')
            };
            return new Response(
                JSON.stringify({
                    message: 'Existing submission is stronger; keeping the best run.',
                    placement: null,
                    leaderboards
                }),
                { status: 409, headers: corsHeaders }
            );
        }
        const { error } = await supabase
            .from('scores')
            .update({
                player_name: playerName,
                score,
                time_ms: timeMs,
                best_streak: bestStreak,
                nyan,
                recorded_at: recordedIso,
                week_start: weekStart,
                client_submission_id: body.clientSubmissionId?.slice(0, 128) ?? null
            })
            .eq('id', current.id);
        if (error) {
            throw error;
        }
    } else {
        const { error } = await supabase.from('scores').insert({
            device_id: deviceId,
            player_name: playerName,
            score,
            time_ms: timeMs,
            best_streak: bestStreak,
            nyan,
            recorded_at: recordedIso,
            week_start: weekStart,
            client_submission_id: body.clientSubmissionId?.slice(0, 128) ?? null
        });
        if (error) {
            throw error;
        }
    }

    const [global, weekly] = await Promise.all([
        fetchLeaderboard('global'),
        fetchLeaderboard('weekly')
    ]);

    const placement = await computePlacement(score, timeMs, recordedAt).catch(() => null);

    return new Response(
        JSON.stringify({
            placement,
            leaderboards: { global, weekly },
            fetchedAt: new Date().toISOString()
        }),
        { status: 201, headers: corsHeaders }
    );
}

async function handleGetLeaderboards(url: URL) {
    const scopesParam = url.searchParams.get('scopes') ?? 'global';
    const requested = scopesParam
        .split(',')
        .map((scope) => scope.trim().toLowerCase())
        .filter((scope): scope is 'global' | 'weekly' => scope === 'global' || scope === 'weekly');

    const scopes = requested.length ? requested : ['global'];

    const entries: Record<'global' | 'weekly', unknown[]> = {
        global: [],
        weekly: []
    };

    await Promise.all(
        scopes.map(async (scope) => {
            entries[scope] = await fetchLeaderboard(scope);
        })
    );

    return new Response(
        JSON.stringify({
            leaderboards: entries,
            fetchedAt: new Date().toISOString()
        }),
        { status: 200, headers: corsHeaders }
    );
}

serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { status: 200, headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        if (request.method === 'POST' && url.pathname.endsWith('/scores')) {
            return await handleSubmit(request);
        }
        if (request.method === 'GET' && url.pathname.endsWith('/leaderboards')) {
            return await handleGetLeaderboards(url);
        }
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: corsHeaders
        });
    }
});
