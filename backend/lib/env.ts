import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RUN_TOKEN_SECRET = Deno.env.get("RUN_TOKEN_SECRET");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
}

if (!RUN_TOKEN_SECRET) {
  throw new Error("Missing RUN_TOKEN_SECRET environment variable.");
}

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export const kv = await Deno.openKv();

const rawRunTokenTtl = Number(Deno.env.get("RUN_TOKEN_TTL_MS") ?? "300000");
export const RUN_TOKEN_TTL_MS =
  Number.isFinite(rawRunTokenTtl) && rawRunTokenTtl > 1000
    ? Math.min(rawRunTokenTtl, 900_000)
    : 300_000;
export const RUN_TOKEN_BUFFER_MS = 1000;

const textEncoder = new TextEncoder();
let hmacKeyPromise: Promise<CryptoKey> | null = null;

export function getRunTokenHmacKey(): Promise<CryptoKey> {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      textEncoder.encode(RUN_TOKEN_SECRET!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return hmacKeyPromise;
}
