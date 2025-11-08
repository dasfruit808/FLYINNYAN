import {
  encode as encodeBase64Url,
  decode as decodeBase64Url,
} from "https://deno.land/std@0.224.0/encoding/base64url.ts";

import {
  RUN_TOKEN_BUFFER_MS,
  RUN_TOKEN_TTL_MS,
  getRunTokenHmacKey,
  kv,
} from "./env.ts";

const textEncoder = new TextEncoder();

export interface RunTokenRecord {
  deviceId: string;
  expiresAt: number;
}

export interface RunTokenValidation {
  tokenId: string;
  expiresAt: number;
}

export function createRunTokenKey(tokenId: string): Deno.KvKey {
  return ["run-token", tokenId];
}

function isRunTokenFresh(expiresAt: number): boolean {
  return expiresAt - RUN_TOKEN_BUFFER_MS > Date.now();
}

async function signRunToken(
  tokenId: string,
  deviceId: string,
  expiresAt: number,
): Promise<string> {
  const hmacKey = await getRunTokenHmacKey();
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
  const hmacKey = await getRunTokenHmacKey();
  const payload = `${tokenId}.${deviceId}.${expiresAt}`;
  return crypto.subtle.verify(
    "HMAC",
    hmacKey,
    signatureBytes,
    textEncoder.encode(payload),
  );
}

export async function issueRunToken(deviceId: string) {
  const tokenId = crypto.randomUUID();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + RUN_TOKEN_TTL_MS;
  const signature = await signRunToken(tokenId, deviceId, expiresAt);
  const token = `${tokenId}.${expiresAt}.${signature}`;
  const key = createRunTokenKey(tokenId);
  const ttl = Math.max(1000, expiresAt - issuedAt);
  await kv.set(key, { deviceId, expiresAt }, { expireIn: ttl });
  return { token, tokenId, expiresAt };
}

export async function validateRunToken(
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

export async function consumeRunToken(tokenId: string) {
  await kv.delete(createRunTokenKey(tokenId));
}
