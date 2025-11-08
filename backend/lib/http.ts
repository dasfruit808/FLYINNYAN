export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
} as const;

export const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

function mergeHeaders(input: HeadersInit = {}): Headers {
  const headers = new Headers(input);
  Object.entries({ ...corsHeaders, ...jsonHeaders }).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });
  return headers;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = mergeHeaders(init.headers);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, { status });
}
