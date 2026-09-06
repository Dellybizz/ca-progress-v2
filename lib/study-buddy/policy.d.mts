export const STUDY_BUDDY_NUDGE_MAX_PER_24H: 3;
export const STUDY_BUDDY_NUDGE_COOLDOWN_MS: number;
export const STUDY_TOGETHER_INVITE_MAX_PER_24H: 5;
export const STUDY_TOGETHER_INVITE_COOLDOWN_MS: number;
export function canonicalStudyBuddyPair(a: unknown, b: unknown): [string,string];
export function checkStudyBuddyRateLimit(input: { events?: Array<string|Date>; now?: number; maxPer24h: number; cooldownMs: number }): { allowed: boolean; reason: "daily_limit"|"cooldown"|null };
export function summarizeStudyBuddyGoal(contributions: Array<{userId?: string; minutes?: number}>, targetMinutes: number): { byUser: Record<string,number>; totalMinutes: number; remainingMinutes: number; percent: number };
export function resolveStudyTogetherCompletion(input: { status: string; participants: string[]; completions: Array<{userId?: string; minutes?: number}> }): { complete: boolean; creditedUserIds: string[] };
