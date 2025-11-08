import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { corsHeaders, errorResponse, jsonResponse } from "./lib/http.ts";
import { supabase } from "./lib/env.ts";
import { extractClientIp, readRequestJson } from "./lib/request.ts";
import {
  computePlacement,
  enforceRateLimit,
  fetchLeaderboardSet,
  normalizeScorePayload,
  type NormalizedScorePayload,
} from "./lib/leaderboard.ts";
import { sanitizeName, getWeekStart } from "./lib/utils.ts";
import {
  consumeRunToken,
  issueRunToken,
  validateRunToken,
} from "./lib/run-tokens.ts";

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

async function handleIssueRunToken(request: Request) {
  const body = await readRequestJson<{ deviceId?: string }>(request);
  if (!body) {
    return errorResponse("Invalid JSON payload.", 400);
  }
  const deviceId = (body.deviceId ?? "").trim().slice(0, 64);
  if (!deviceId) {
    return errorResponse("Missing device identifier.", 400);
  }
  const { token, expiresAt } = await issueRunToken(deviceId);
  return jsonResponse({ runToken: token, expiresAt }, { status: 201 });
}

async function handleSubmit(request: Request) {
  const body = await readRequestJson<ScorePayload>(request);
  if (!body) {
    return errorResponse("Invalid JSON payload.", 400);
  }

  const playerName = sanitizeName(String(body.playerName ?? ""));
  const deviceId = (body.deviceId ?? "").trim().slice(0, 64);
  if (!deviceId) {
    return errorResponse("Missing device identifier.", 400);
  }

  const runToken = typeof body.runToken === "string" ? body.runToken.trim() : "";
  if (!runToken) {
    return errorResponse("Missing run token.", 401);
  }

  const clientSubmissionId =
    typeof body.clientSubmissionId === "string"
      ? body.clientSubmissionId.trim().slice(0, 128)
      : "";

  let runTokenValidation: Awaited<ReturnType<typeof validateRunToken>>;
  try {
    runTokenValidation = await validateRunToken(runToken, deviceId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid run token.";
    return errorResponse(message, 401);
  }

  let shouldDeleteRunToken = false;

  try {
    const { score, timeMs, bestStreak, nyan, recordedAt }:
      NormalizedScorePayload = normalizeScorePayload(body);

    if (score <= 0 || timeMs <= 0) {
      return errorResponse("Invalid score payload.", 400);
    }

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
        const leaderboards = await fetchLeaderboardSet();
        const placement = await computePlacement(
          existingRun.score,
          existingRun.time_ms,
          recordedTimestamp,
        ).catch(() => null);

        await consumeRunToken(runTokenValidation.tokenId);
        shouldDeleteRunToken = false;

        return jsonResponse(
          {
            message:
              "Duplicate submission detected; using previously stored result.",
            placement,
            leaderboards,
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
        const leaderboards = await fetchLeaderboardSet();
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

    const leaderboards = await fetchLeaderboardSet();

    const placement = await computePlacement(score, timeMs, recordedAt).catch(
      () => null,
    );

    if (shouldDeleteRunToken) {
      await consumeRunToken(runTokenValidation.tokenId);
      shouldDeleteRunToken = false;
    }

    return jsonResponse(
      {
        placement,
        leaderboards,
        fetchedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  } finally {
    if (shouldDeleteRunToken) {
      await consumeRunToken(runTokenValidation.tokenId);
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

  const leaderboards = await fetchLeaderboardSet(scopes);

  return jsonResponse({
    leaderboards,
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
