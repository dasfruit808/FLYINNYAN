import { kv, supabase } from "./env.ts";
import { clampNumber, getWeekStart, sanitizeName } from "./utils.ts";

export type LeaderboardScope = "global" | "weekly";

export interface LeaderboardRow {
  player_name: string;
  score: number;
  time_ms: number;
  best_streak: number | null;
  nyan: number | null;
  recorded_at: string;
}

export interface LeaderboardEntry {
  player: string;
  score: number;
  timeMs: number;
  bestStreak: number;
  nyan: number;
  recordedAt: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAt: number };

export async function enforceRateLimit(
  identifier: string,
  limit = 10,
  windowMs = 60_000,
): Promise<RateLimitResult> {
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

export async function fetchLeaderboard(scope: LeaderboardScope) {
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

export async function fetchLeaderboardSet(
  scopes: LeaderboardScope[] = ["global", "weekly"],
): Promise<Record<LeaderboardScope, LeaderboardEntry[]>> {
  const uniqueScopes = Array.from(new Set(scopes));
  const entries: Record<LeaderboardScope, LeaderboardEntry[]> = {
    global: [],
    weekly: [],
  };

  await Promise.all(
    uniqueScopes.map(async (scope) => {
      entries[scope] = await fetchLeaderboard(scope);
    }),
  );

  return entries;
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

export async function computePlacement(
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

export interface NormalizedScorePayload {
  score: number;
  timeMs: number;
  bestStreak: number;
  nyan: number;
  recordedAt: number;
}

export function normalizeScorePayload(payload: {
  score: unknown;
  timeMs: unknown;
  bestStreak?: unknown;
  nyan?: unknown;
  recordedAt?: unknown;
}): NormalizedScorePayload {
  const score = clampNumber(payload.score);
  const timeMs = clampNumber(payload.timeMs);
  return {
    score,
    timeMs,
    bestStreak: clampNumber(payload.bestStreak, { max: 9999 }),
    nyan: clampNumber(payload.nyan, { max: 1_000_000 }),
    recordedAt: clampNumber(payload.recordedAt ?? Date.now(), { min: 0 }),
  };
}
