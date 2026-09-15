import { MEANINGFUL_STUDY_SECONDS } from "./policy.mjs";

export const LEADERBOARD_CATEGORIES = Object.freeze(["overall", "foundation", "intermediate", "final"]);
export const REFERRAL_ACTIVATION_SESSION_COUNT = 3;
export const REFERRAL_ACTIVATION_XP = 200;
export const IMPOSSIBLE_SESSION_SECONDS = 15 * 60 * 60;
export const MAX_DAILY_XP_BEFORE_FLAG = 750;

export const ANTI_CHEAT_SIGNAL_TYPES = Object.freeze([
  "impossible_timer",
  "repeated_impossible_sessions",
  "rapid_chapter_completion",
  "fake_test_pattern",
  "delete_reenter_xp_loop",
  "simultaneous_timers",
  "excessive_daily_xp",
]);

export function normalizeLeaderboardCategory(value) {
  const category = String(value || "overall").trim().toLowerCase();
  return LEADERBOARD_CATEGORIES.includes(category) ? category : "overall";
}

export function sanitizePublicAlias(value) {
  const raw = typeof value === "string" ? value.normalize("NFKC") : "";
  const withoutControls = raw.replace(/[\u0000-\u001f\u007f]/g, " ");
  const withoutEmail = withoutControls.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/gi, "");
  const withoutUrls = withoutEmail.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "");
  const cleaned = withoutUrls.replace(/\s+/g, " ").trim().slice(0, 40);
  return cleaned || "CA Candidate";
}

export function monthPeriodKey(instant = new Date()) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid leaderboard month instant.");
  return date.toISOString().slice(0, 7);
}

export function monthWindow(periodKey) {
  if (!/^\d{4}-\d{2}$/.test(String(periodKey))) throw new Error("Invalid leaderboard period.");
  const [year, month] = String(periodKey).split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("Invalid leaderboard period.");
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { periodKey: String(periodKey), startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function nextMonthRewardWindow(competitionPeriod) {
  const current = monthWindow(competitionPeriod);
  const nextStart = new Date(current.endsAt);
  const rewardPeriod = monthPeriodKey(nextStart);
  const reward = monthWindow(rewardPeriod);
  return { competitionPeriod: current.periodKey, rewardPeriod, startsAt: reward.startsAt, endsAt: reward.endsAt };
}

export function rewardForRank(rawRank) {
  const rank = Math.floor(Number(rawRank));
  if (rank === 1) return Object.freeze({ rank: 1, rewardTier: "premium", label: "Premium" });
  if (rank === 2 || rank === 3) return Object.freeze({ rank, rewardTier: "pro", label: "Pro" });
  return null;
}

export function qualifyingReferralSessions(rows) {
  const seen = new Set();
  const qualifying = [];
  for (const row of rows ?? []) {
    const id = String(row?.id || "").trim();
    const duration = Number(row?.duration_seconds ?? row?.durationSeconds ?? 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (duration < MEANINGFUL_STUDY_SECONDS || duration >= IMPOSSIBLE_SESSION_SECONDS) continue;
    qualifying.push(row);
  }
  return qualifying;
}

export function referralActivationState(rows) {
  const qualifyingCount = qualifyingReferralSessions(rows).length;
  return { qualifyingCount, activated: qualifyingCount >= REFERRAL_ACTIVATION_SESSION_COUNT };
}

function millis(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function detectSessionSignals(rows) {
  const sessions = (rows ?? []).map((row) => ({
    id: String(row?.id || ""),
    durationSeconds: Number(row?.duration_seconds ?? row?.durationSeconds ?? 0),
    startedAt: String(row?.started_at ?? row?.startedAt ?? ""),
    endedAt: String(row?.ended_at ?? row?.endedAt ?? ""),
  })).filter((row) => row.id);
  const impossible = sessions.filter((row) => row.durationSeconds >= IMPOSSIBLE_SESSION_SECONDS);
  const overlappingPairs = [];
  const sorted = [...sessions].sort((a, b) => (millis(a.startedAt) ?? 0) - (millis(b.startedAt) ?? 0));
  for (let i = 0; i < sorted.length; i += 1) {
    const leftStart = millis(sorted[i].startedAt);
    const leftEnd = millis(sorted[i].endedAt);
    if (leftStart === null || leftEnd === null) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const rightStart = millis(sorted[j].startedAt);
      const rightEnd = millis(sorted[j].endedAt);
      if (rightStart === null || rightEnd === null) continue;
      if (rightStart >= leftEnd) break;
      if (rightStart < leftEnd && rightEnd > leftStart) overlappingPairs.push([sorted[i].id, sorted[j].id]);
    }
  }
  return {
    impossibleSessionIds: impossible.map((row) => row.id),
    repeatedImpossible: impossible.length >= 2,
    overlappingPairs,
    simultaneous: overlappingPairs.length > 0,
  };
}

export function detectRapidChapterCompletion(rows) {
  const times = (rows ?? []).map((row) => ({ id: String(row?.chapter_id ?? row?.chapterId ?? ""), at: millis(row?.completed_at ?? row?.completedAt) }))
    .filter((row) => row.id && row.at !== null)
    .sort((a, b) => a.at - b.at);
  for (let i = 0; i < times.length; i += 1) {
    const ids = new Set();
    for (let j = i; j < times.length && times[j].at - times[i].at <= 10 * 60 * 1000; j += 1) ids.add(times[j].id);
    if (ids.size >= 5) return { suspicious: true, count: ids.size, windowStart: new Date(times[i].at).toISOString() };
  }
  return { suspicious: false, count: 0, windowStart: null };
}

export function detectFakeTestPattern(rows) {
  const tests = (rows ?? []).map((row) => ({
    id: String(row?.id || ""),
    at: millis(row?.completed_at ?? row?.completedAt),
    durationMinutes: row?.duration_minutes == null && row?.durationMinutes == null ? null : Number(row?.duration_minutes ?? row?.durationMinutes),
  })).filter((row) => row.id && row.at !== null).sort((a, b) => a.at - b.at);
  const ultraShort = tests.filter((row) => row.durationMinutes !== null && row.durationMinutes <= 2);
  if (ultraShort.length >= 5) return { suspicious: true, reason: "ultra_short_tests", count: ultraShort.length };
  for (let i = 0; i < tests.length; i += 1) {
    let count = 0;
    for (let j = i; j < tests.length && tests[j].at - tests[i].at <= 10 * 60 * 1000; j += 1) count += 1;
    if (count >= 4) return { suspicious: true, reason: "rapid_test_cluster", count };
  }
  return { suspicious: false, reason: null, count: 0 };
}

export function detectProgressLoop(rows) {
  const buckets = new Map();
  for (const row of rows ?? []) {
    const chapter = String(row?.chapter_id ?? row?.chapterId ?? "");
    const stage = String(row?.stage || "");
    const action = String(row?.action || "");
    const at = millis(row?.created_at ?? row?.createdAt);
    if (!chapter || !stage || !["set", "clear"].includes(action) || at === null) continue;
    const key = `${chapter}:${stage}`;
    const items = buckets.get(key) ?? [];
    items.push({ action, at });
    buckets.set(key, items);
  }
  for (const [key, items] of buckets) {
    items.sort((a, b) => a.at - b.at);
    for (let i = 0; i < items.length; i += 1) {
      const withinDay = items.filter((item) => item.at >= items[i].at && item.at - items[i].at <= 24 * 60 * 60 * 1000);
      let transitions = 0;
      for (let j = 1; j < withinDay.length; j += 1) if (withinDay[j].action !== withinDay[j - 1].action) transitions += 1;
      if (transitions >= 4) return { suspicious: true, evidenceKey: key, transitions };
    }
  }
  return { suspicious: false, evidenceKey: null, transitions: 0 };
}

export function detectExcessiveDailyXp(rows, threshold = MAX_DAILY_XP_BEFORE_FLAG) {
  const totals = new Map();
  for (const row of rows ?? []) {
    const occurredAt = String(row?.occurred_at ?? row?.occurredAt ?? "");
    const parsed = millis(occurredAt);
    if (parsed === null) continue;
    const day = new Date(parsed).toISOString().slice(0, 10);
    totals.set(day, (totals.get(day) ?? 0) + Math.max(0, Number(row?.xp_amount ?? row?.xp ?? 0)));
  }
  const suspiciousDays = [...totals.entries()].filter(([, total]) => total > threshold).map(([day, totalXp]) => ({ day, totalXp }));
  return { suspicious: suspiciousDays.length > 0, suspiciousDays };
}

export function publicLeaderboardEntry(input) {
  return Object.freeze({
    rank: Math.max(1, Math.floor(Number(input?.rank) || 1)),
    displayName: sanitizePublicAlias(input?.displayName),
    totalXp: Math.max(0, Math.floor(Number(input?.totalXp) || 0)),
    levelName: String(input?.levelName || "Focused Candidate").slice(0, 60),
  });
}

export function publicShareCard(input) {
  const kind = ["weekly", "milestone", "syllabus", "leaderboard"].includes(String(input?.kind)) ? String(input.kind) : "milestone";
  return Object.freeze({
    kind,
    title: String(input?.title || "CA Progress milestone").slice(0, 80),
    primary: String(input?.primary || "Progress recorded").slice(0, 80),
    secondary: String(input?.secondary || "").slice(0, 140),
  });
}
