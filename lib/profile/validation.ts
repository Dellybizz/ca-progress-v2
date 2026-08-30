export const CA_LEVELS = ["foundation", "intermediate", "final"] as const;
export const GROUP_CHOICES = ["group_1", "group_2", "both", "not_applicable"] as const;
export type CALevel = (typeof CA_LEVELS)[number];
export type GroupChoice = (typeof GROUP_CHOICES)[number];

export type AttemptOption = { key: string; label: string; kind?: string; levels?: CALevel[] };

export function isCALevel(value: unknown): value is CALevel {
  return typeof value === "string" && CA_LEVELS.includes(value as CALevel);
}

export function isGroupChoice(value: unknown): value is GroupChoice {
  return typeof value === "string" && GROUP_CHOICES.includes(value as GroupChoice);
}

export function normalizeDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 80 ? name : null;
}

export function normalizeDailyTarget(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) && numeric >= 15 && numeric <= 720 ? numeric : null;
}

export function attemptAppliesToLevel(option: AttemptOption, level: CALevel) {
  return !option.levels?.length || option.levels.includes(level);
}

export function validateAcademicSelection(input: { level: unknown; group: unknown; attemptKey: unknown; dailyTargetMinutes: unknown }, attempts: AttemptOption[]) {
  if (!isCALevel(input.level)) return { ok: false as const, error: "Choose a valid CA level." };
  if (!isGroupChoice(input.group)) return { ok: false as const, error: "Choose a valid group." };
  const level = input.level;
  const group = input.group;
  if (level === "foundation" && group !== "not_applicable") return { ok: false as const, error: "Foundation does not use a group selection in this onboarding contract." };
  if (level !== "foundation" && group === "not_applicable") return { ok: false as const, error: "Choose Group 1, Group 2 or Both." };
  if (typeof input.attemptKey !== "string" || !attempts.some((option) => option.key === input.attemptKey && attemptAppliesToLevel(option, level))) return { ok: false as const, error: "Choose an attempt applicable to this CA level." };
  const dailyTargetMinutes = normalizeDailyTarget(input.dailyTargetMinutes);
  if (dailyTargetMinutes === null) return { ok: false as const, error: "Daily target must be between 15 and 720 minutes." };
  return { ok: true as const, value: { level, group, attemptKey: input.attemptKey, dailyTargetMinutes } };
}
