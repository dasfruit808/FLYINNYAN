export async function readRequestJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function extractClientIp(request: Request, fallback: string): string {
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
