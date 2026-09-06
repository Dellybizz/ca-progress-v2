export const STUDY_BUDDY_NUDGE_MAX_PER_24H = 3;
export const STUDY_BUDDY_NUDGE_COOLDOWN_MS = 30 * 60 * 1000;
export const STUDY_TOGETHER_INVITE_MAX_PER_24H = 5;
export const STUDY_TOGETHER_INVITE_COOLDOWN_MS = 15 * 60 * 1000;

export function canonicalStudyBuddyPair(a, b) {
  const left = typeof a === "string" ? a.trim() : "";
  const right = typeof b === "string" ? b.trim() : "";
  if (!left || !right || left === right) throw new Error("Study Buddy requires two different users.");
  return left < right ? [left, right] : [right, left];
}

export function checkStudyBuddyRateLimit({ events = [], now = Date.now(), maxPer24h, cooldownMs }) {
  const times = events.map((value) => value instanceof Date ? value.getTime() : new Date(value).getTime()).filter(Number.isFinite).sort((a, b) => b - a);
  const cutoff = now - 24 * 60 * 60 * 1000;
  const recent = times.filter((time) => time >= cutoff);
  if (recent.length >= maxPer24h) return { allowed: false, reason: "daily_limit" };
  if (recent.length && now - recent[0] < cooldownMs) return { allowed: false, reason: "cooldown" };
  return { allowed: true, reason: null };
}

export function summarizeStudyBuddyGoal(contributions = [], targetMinutes = 0) {
  const byUser = {};
  let totalMinutes = 0;
  for (const item of contributions) {
    const minutes = Number(item?.minutes ?? 0);
    const userId = typeof item?.userId === "string" ? item.userId : "";
    if (!userId || !Number.isFinite(minutes) || minutes <= 0) continue;
    const whole = Math.floor(minutes);
    byUser[userId] = (byUser[userId] ?? 0) + whole;
    totalMinutes += whole;
  }
  const target = Math.max(0, Math.floor(Number(targetMinutes) || 0));
  return {
    byUser,
    totalMinutes,
    remainingMinutes: Math.max(0, target - totalMinutes),
    percent: target > 0 ? Math.min(100, Math.round((totalMinutes / target) * 100)) : 0,
  };
}

export function resolveStudyTogetherCompletion({ status, participants = [], completions = [] }) {
  if (!new Set(["accepted", "completed"]).has(status)) return { complete: false, creditedUserIds: [] };
  const allowed = new Set(participants.filter(Boolean));
  const credited = [];
  const seen = new Set();
  for (const item of completions) {
    const userId = item?.userId;
    if (!allowed.has(userId) || seen.has(userId)) continue;
    const minutes = Number(item?.minutes ?? 0);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    seen.add(userId);
    credited.push(userId);
  }
  return { complete: allowed.size === 2 && credited.length === 2, creditedUserIds: credited };
}
