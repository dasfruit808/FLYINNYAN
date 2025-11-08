export function sanitizeName(name: string): string {
  return (
    name
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^A-Za-z0-9 _\-]/g, "")
      .slice(0, 24) || "Ace Pilot"
  );
}

export function clampNumber(
  value: unknown,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(Math.floor(numeric), min), max);
}

export function getWeekStart(timestamp: number): Date {
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
