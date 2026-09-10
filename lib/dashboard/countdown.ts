const DAY_MS = 86_400_000;
export const EXAM_TIMEZONE = "Asia/Kolkata";

export function dateKeyInIst(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: EXAM_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function daysBetweenDateKeys(from: string, to: string) {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.ceil((toMs - fromMs) / DAY_MS);
}
