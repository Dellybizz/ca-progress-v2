export const primaryUseOptions = [
  { key: "plan", label: "Plan my study day", description: "Build a clear daily plan and know what to work on next." },
  { key: "progress", label: "Track progress & revision", description: "Keep chapter completion, revisions and tests organized." },
  { key: "focus", label: "Study with more focus", description: "Use focused study sessions, targets and streaks." },
  { key: "updates", label: "Stay current with ICAI", description: "Follow your syllabus, attempt and verified ICAI updates." },
  { key: "tests", label: "Prepare for tests", description: "Keep tests, revision work and readiness in one place." },
  { key: "community", label: "Learn with others", description: "Use subject discussions, resources and the CA community." },
] as const;

export type PrimaryUse = (typeof primaryUseOptions)[number]["key"];

export function isPrimaryUse(value: unknown): value is PrimaryUse {
  return typeof value === "string" && primaryUseOptions.some((option) => option.key === value);
}

export function isPrimaryUsePriority(value: unknown): value is PrimaryUse[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > primaryUseOptions.length) return false;
  if (!value.every(isPrimaryUse)) return false;
  return new Set(value).size === value.length;
}

export function normalizePrimaryUsePriority(value: unknown, fallback?: unknown): PrimaryUse[] {
  if (isPrimaryUsePriority(value)) return value;
  if (isPrimaryUse(fallback)) return [fallback];
  return [];
}
