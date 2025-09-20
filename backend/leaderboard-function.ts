import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  encode as encodeBase64Url,
  decode as decodeBase64Url,
} from "https://deno.land/std@0.224.0/encoding/base64url.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RUN_TOKEN_SECRET = Deno.env.get("RUN_TOKEN_SECRET");
const RUN_TOKEN_TTL_MS = (() => {
  const raw = Number(Deno.env.get("RUN_TOKEN_TTL_MS") ?? "300000");
  if (Number.isFinite(raw) && raw > 1000) {
    return Math.min(raw, 900_000);
  }
  return 300_000;
})();
const RUN_TOKEN_BUFFER_MS = 1000;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
}

if (!RUN_TOKEN_SECRET) {
  throw new Error("Missing RUN_TOKEN_SECRET environment variable.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const kv = await Deno.openKv();
const textEncoder = new TextEncoder();
const hmacKeyPromise = crypto.subtle.importKey(
  "raw",
  textEncoder.encode(RUN_TOKEN_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

interface RunTokenRecord {
  deviceId: string;
  expiresAt: number;
}

interface RunTokenValidation {
  tokenId: string;
  expiresAt: number;
}

interface ScorePayload {
  playerName: string;
  deviceId: string;
  clientSubmissionId?: string;
  runToken?: string;
  score: number;
  timeMs: number;
  bestStreak?: number;
  nyan?: number;
  recordedAt?: number;
}

interface LeaderboardRow {
  player_name: string;
  score: number;
  time_ms: number;
  best_streak: number | null;
  nyan: number | null;
  recorded_at: string;
}

interface LeaderboardEntry {
  player: string;
  score: number;
  timeMs: number;
  bestStreak: number;
  nyan: number;
  recordedAt: number;
}

function sanitizeName(name: string): string {
  return (
    name
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^A-Za-z0-9 _\-]/g, "")
      .slice(0, 24) || "Ace Pilot"
  );
}

function clampNumber(
  value: unknown,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(Math.floor(numeric), min), max);
}

function createRunTokenKey(tokenId: string): Deno.KvKey {
  return ["run-token", tokenId];
}

function isRunTokenFresh(expiresAt: number): boolean {
  return expiresAt - RUN_TOKEN_BUFFER_MS > Date.now();
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers ?? {});
  Object.entries({ ...corsHeaders, ...jsonHeaders }).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });
  return new Response(JSON.stringify(body), { ...init, headers });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, { status });
}

async function readRequestJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function extractClientIp(request: Request, fallback: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    if (first?.trim()) {
      return first.trim();
    }
  }
  const candidates = ["cf-connecting-ip", "x-real-ip"];
  for (const header of candidates) {
    const value = request.headers.get(header);
    if (value) {
      return value;
    }
  }
  return fallback;
}

async function signRunToken(
  tokenId: string,
  deviceId: string,
  expiresAt: number,
): Promise<string> {
  const hmacKey = await hmacKeyPromise;
  const payload = `${tokenId}.${deviceId}.${expiresAt}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    textEncoder.encode(payload),
  );
  return encodeBase64Url(new Uint8Array(signature));
}

async function verifyRunTokenSignature(
  tokenId: string,
  deviceId: string,
  expiresAt: number,
  signature: string,
): Promise<boolean> {
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase64Url(signature);
  } catch {
    return false;
  }
  const hmacKey = await hmacKeyPromise;
  const payload = `${tokenId}.${deviceId}.${expiresAt}`;
  return crypto.subtle.verify(
    "HMAC",
    hmacKey,
    signatureBytes,
    textEncoder.encode(payload),
  );
}

async function validateRunToken(
  runToken: string,
  deviceId: string,
): Promise<RunTokenValidation> {
  const parts = runToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid run token.");
  }
  const [tokenId, rawExpiresAt, signature] = parts;
  if (!tokenId || !rawExpiresAt || !signature) {
    throw new Error("Invalid run token.");
  }
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isFinite(expiresAt)) {
    throw new Error("Invalid run token.");
  }
  if (!isRunTokenFresh(expiresAt)) {
    throw new Error("Run token has expired.");
  }
  const signatureValid = await verifyRunTokenSignature(
    tokenId,
    deviceId,
    expiresAt,
    signature,
  );
  if (!signatureValid) {
    throw new Error("Invalid run token.");
  }
  const record = await kv.get<RunTokenRecord>(createRunTokenKey(tokenId));
  if (!record.value) {
    throw new Error("Run token has expired.");
  }
  if (record.value.deviceId !== deviceId) {
    throw new Error("Invalid run token.");
  }
  if (!isRunTokenFresh(record.value.expiresAt)) {
    await kv.delete(createRunTokenKey(tokenId));
    throw new Error("Run token has expired.");
  }
  return { tokenId, expiresAt };
}

function getWeekStart(timestamp: number): Date {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - diff);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

async function enforceRateLimit(
  identifier: string,
  limit = 10,
  windowMs = 60_000,
) {
  if (!identifier) {
    return { allowed: true };
  }
  const now = Date.now();
  const windowKey = Math.floor(now / windowMs);
  const key = ["rate-limit", identifier, windowKey];
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

async function fetchLeaderboard(scope: "global" | "weekly") {
  const candidateLimit = scope === "weekly" ? 120 : 200;
  const baseQuery = supabase
    .from("scores")
    .select("player_name, score, time_ms, best_streak, nyan, recorded_at", {
      head: false,
    })
    .order("score", { ascending: false })
    .order("time_ms", { ascending: false })
    .order("recorded_at", { ascending: true })
    .limit(candidateLimit);

  if (scope === "weekly") {
    const startOfWeek = getWeekStart(Date.now()).toISOString();
    baseQuery.gte("recorded_at", startOfWeek);
  }

  const { data, error } = await baseQuery;
  if (error) {
    throw error;
  }
  return dedupeLeaderboardEntries(data ?? []);
}

function dedupeLeaderboardEntries(
  rows: LeaderboardRow[],
  limit = 50,
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const player = sanitizeName(row.player_name);
    const playerKey = player.toLowerCase();

    if (seen.has(playerKey)) {
      continue;
    }

    seen.add(playerKey);

    entries.push({
      player,
      score: row.score,
      timeMs: row.time_ms,
      bestStreak: row.best_streak ?? 0,
      nyan: row.nyan ?? 0,
      recordedAt: new Date(row.recorded_at).getTime(),
    });

    if (entries.length >= limit) {
      break;
    }
  }

  return entries;
}

async function computePlacement(
  score: number,
  timeMs: number,
  recordedAt: number,
) {
  const isoRecordedAt = new Date(recordedAt).toISOString();
  const filters = [
    `score.gt.${score}`,
    `and(score.eq.${score},time_ms.gt.${timeMs})`,
    `and(score.eq.${score},time_ms.eq.${timeMs},recorded_at.lt.${isoRecordedAt})`,
  ];
  const { count, error } = await supabase
    .from("scores")
    .select("id", { head: true, count: "exact" })
    .or(filters.join(","));
  if (error) {
    throw error;
  }
  if (typeof count !== "number") {
    return null;
  }
  return count + 1;
}

async function handleIssueRunToken(request: Request) {
  const body = await readRequestJson<{ deviceId?: string }>(request);
  if (!body) {
    return errorResponse("Invalid JSON payload.", 400);
  }
  const deviceId = (body.deviceId ?? "").trim().slice(0, 64);
  if (!deviceId) {
    return errorResponse("Missing device identifier.", 400);
  }
  const tokenId = crypto.randomUUID();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + RUN_TOKEN_TTL_MS;
  const signature = await signRunToken(tokenId, deviceId, expiresAt);
  const token = `${tokenId}.${expiresAt}.${signature}`;
  const key = createRunTokenKey(tokenId);
  const ttl = Math.max(1000, expiresAt - issuedAt);
  await kv.set(key, { deviceId, expiresAt }, { expireIn: ttl });
  return jsonResponse({ runToken: token, expiresAt }, { status: 201 });
}

async function handleSubmit(request: Request) {
  const body = await readRequestJson<ScorePayload>(request);
  if (!body) {
    return errorResponse("Invalid JSON payload.", 400);
  }

  const playerName = sanitizeName(body.playerName);
  const deviceId = (body.deviceId ?? "").trim().slice(0, 64);
  if (!deviceId) {
    return errorResponse("Missing device identifier.", 400);
  }

  const runToken =
    typeof body.runToken === "string" ? body.runToken.trim() : "";
  if (!runToken) {
    return errorResponse("Missing run token.", 401);
  }

  const clientSubmissionId =
    typeof body.clientSubmissionId === "string"
      ? body.clientSubmissionId.trim().slice(0, 128)
      : "";

  let runTokenValidation: RunTokenValidation;
  try {
    runTokenValidation = await validateRunToken(runToken, deviceId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid run token.";
    return errorResponse(message, 401);
  }

  const runTokenKey = createRunTokenKey(runTokenValidation.tokenId);
  let shouldDeleteRunToken = false;

  try {
    const score = clampNumber(body.score);
    const timeMs = clampNumber(body.timeMs);
    if (score <= 0 || timeMs <= 0) {
      return errorResponse("Invalid score payload.", 400);
    }

    const bestStreak = clampNumber(body.bestStreak, { max: 9999 });
    const nyan = clampNumber(body.nyan, { max: 1_000_000 });
    const recordedAt = clampNumber(body.recordedAt ?? Date.now(), { min: 0 });

    const ipAddress = extractClientIp(request, deviceId);

    const rateLimitId = `${deviceId}:${ipAddress}`;
    const limit = await enforceRateLimit(rateLimitId, 12, 60_000);
    if (!limit.allowed) {
      return errorResponse("Rate limit exceeded. Try again shortly.", 429);
    }

    const weekStart = getWeekStart(recordedAt).toISOString();
    const recordedIso = new Date(recordedAt).toISOString();

    if (clientSubmissionId) {
      const duplicate = await supabase
        .from("scores")
        .select(
          "id, device_id, score, time_ms, recorded_at, player_name, best_streak, nyan",
        )
        .eq("client_submission_id", clientSubmissionId)
        .maybeSingle();

      if (duplicate.error && duplicate.error.code !== "PGRST116") {
        throw duplicate.error;
      }

      if (duplicate.data) {
        const existingRun = duplicate.data;
        const recordedTimestamp = new Date(existingRun.recorded_at).getTime();
        const [global, weekly] = await Promise.all([
          fetchLeaderboard("global"),
          fetchLeaderboard("weekly"),
        ]);
        const placement = await computePlacement(
          existingRun.score,
          existingRun.time_ms,
          recordedTimestamp,
        ).catch(() => null);

        await kv.delete(runTokenKey);
        shouldDeleteRunToken = false;

        return jsonResponse(
          {
            message:
              "Duplicate submission detected; using previously stored result.",
            placement,
            leaderboards: { global, weekly },
            fetchedAt: new Date().toISOString(),
          },
          { status: 200 },
        );
      }
    }

    const existing = await supabase
      .from("scores")
      .select("id, score, time_ms, recorded_at")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (existing.error && existing.error.code !== "PGRST116") {
      throw existing.error;
    }

    if (existing.data) {
      const current = existing.data;
      const betterScore = current.score > score;
      const equalScoreBetterTime =
        current.score === score && current.time_ms >= timeMs;
      if (betterScore || equalScoreBetterTime) {
        const leaderboards = {
          global: await fetchLeaderboard("global"),
          weekly: await fetchLeaderboard("weekly"),
        };
        return jsonResponse(
          {
            message: "Existing submission is stronger; keeping the best run.",
            placement: null,
            leaderboards,
          },
          { status: 409 },
        );
      }
      const { error } = await supabase
        .from("scores")
        .update({
          player_name: playerName,
          score,
          time_ms: timeMs,
          best_streak: bestStreak,
          nyan,
          recorded_at: recordedIso,
          week_start: weekStart,
          client_submission_id: clientSubmissionId || null,
        })
        .eq("id", current.id);
      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.from("scores").insert({
        device_id: deviceId,
        player_name: playerName,
        score,
        time_ms: timeMs,
        best_streak: bestStreak,
        nyan,
        recorded_at: recordedIso,
        week_start: weekStart,
        client_submission_id: clientSubmissionId || null,
      });
      if (error) {
        throw error;
      }
    }

    shouldDeleteRunToken = true;

    const [global, weekly] = await Promise.all([
      fetchLeaderboard("global"),
      fetchLeaderboard("weekly"),
    ]);

    const placement = await computePlacement(score, timeMs, recordedAt).catch(
      () => null,
    );

    if (shouldDeleteRunToken) {
      await kv.delete(runTokenKey);
      shouldDeleteRunToken = false;
    }

    return jsonResponse(
      {
        placement,
        leaderboards: { global, weekly },
        fetchedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  } finally {
    if (shouldDeleteRunToken) {
      await kv.delete(runTokenKey);
    }
  }
}

async function handleGetLeaderboards(url: URL) {
  const scopesParam = url.searchParams.get("scopes") ?? "global";
  const requested = scopesParam
    .split(",")
    .map((scope) => scope.trim().toLowerCase())
    .filter(
      (scope): scope is "global" | "weekly" =>
        scope === "global" || scope === "weekly",
    );

  const scopes = requested.length ? requested : ["global"];

  const entries: Record<"global" | "weekly", unknown[]> = {
    global: [],
    weekly: [],
  };

  await Promise.all(
    scopes.map(async (scope) => {
      entries[scope] = await fetchLeaderboard(scope);
    }),
  );

  return jsonResponse({
    leaderboards: entries,
    fetchedAt: new Date().toISOString(),
  });
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/runs")) {
      return await handleIssueRunToken(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/scores")) {
      return await handleSubmit(request);
    }
    if (request.method === "GET" && url.pathname.endsWith("/leaderboards")) {
      return await handleGetLeaderboards(url);
    }
    return errorResponse("Not Found", 404);
  } catch (error) {
    console.error(error);
    return errorResponse("Internal server error", 500);
  }
});
