export const MEANINGFUL_STUDY_SECONDS: number;
export const MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY: number;
export const MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY: number;
export const XP_RULES: Readonly<Record<string, number>>;
export const PROFESSIONAL_LEVELS: ReadonlyArray<Readonly<{ key: string; name: string; minXp: number }>>;
export const ACHIEVEMENT_DEFINITIONS: ReadonlyArray<Readonly<{ key: string; title: string; description: string }>>;

export function xpForEvent(eventType: string): number;
export function xpEventKey(eventType: string, sourceId: unknown, discriminator?: unknown): string;
export function qualifiesMeaningfulStudy(input?: { durationSeconds?: number; completedTodayTasks?: number }): boolean;
export function safeTimezone(value: unknown): string;
export function localDateKey(instant: string | number | Date, timezone: unknown): string;
export function shiftDateKey(key: string, days: number): string;
export function calculateStreakSummary(dateKeys: unknown[], todayKey: string): { current: number; best: number; todayQualified: boolean };
export function selectDailyBounded<T extends { localDate: string }>(rows: T[], maxPerDay: number): T[];
export function levelForXp(rawXp: unknown): {
  key: string;
  name: string;
  minXp: number;
  totalXp: number;
  nextKey: string | null;
  nextName: string | null;
  nextMinXp: number | null;
  progressPercent: number;
};
export function achievementKeysForMetrics(metrics?: {
  meaningfulSessionCount?: number;
  studySeconds?: number;
  revisionCount?: number;
  testCount?: number;
  bestStreak?: number;
  syllabusComplete?: boolean;
}): string[];
export function achievementDefinition(key: string): { key: string; title: string; description: string } | null;
