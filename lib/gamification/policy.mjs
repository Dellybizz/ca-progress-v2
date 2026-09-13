export const MEANINGFUL_STUDY_SECONDS = 20 * 60;
export const MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY = 6;
export const MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY = 8;

export const XP_RULES = Object.freeze({
  valid_session: 12,
  today_task: 6,
  chapter_completion: 40,
  revision_1: 20,
  revision_2: 25,
  test: 30,
  daily_goal: 12,
  weekly_goal: 30,
  reflection: 6,
  resolved_doubt: 10,
  study_together: 8,
});

export const PROFESSIONAL_LEVELS = Object.freeze([
  Object.freeze({ key: "focused", name: "Focused Candidate", minXp: 0 }),
  Object.freeze({ key: "consistent", name: "Consistent Candidate", minXp: 250 }),
  Object.freeze({ key: "disciplined", name: "Disciplined Candidate", minXp: 750 }),
  Object.freeze({ key: "advanced", name: "Advanced Candidate", minXp: 1500 }),
  Object.freeze({ key: "exam_ready", name: "Exam-Ready Candidate", minXp: 3000 }),
  Object.freeze({ key: "distinguished", name: "Distinguished Candidate", minXp: 5000 }),
]);

export const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "first_session", title: "First Focus Session", description: "Complete your first meaningful study session." }),
  Object.freeze({ key: "study_10h", title: "10 Study Hours", description: "Record 10 hours of meaningful study." }),
  Object.freeze({ key: "study_50h", title: "50 Study Hours", description: "Record 50 hours of meaningful study." }),
  Object.freeze({ key: "study_100h", title: "100 Study Hours", description: "Record 100 hours of meaningful study." }),
  Object.freeze({ key: "first_revision", title: "First Revision", description: "Complete your first revision milestone." }),
  Object.freeze({ key: "revision_25", title: "25 Revisions", description: "Complete 25 revision milestones." }),
  Object.freeze({ key: "first_test", title: "First Test", description: "Record your first completed test attempt." }),
  Object.freeze({ key: "test_10", title: "10 Tests", description: "Record 10 completed test milestones." }),
  Object.freeze({ key: "streak_7", title: "7-Day Consistency", description: "Build a seven-day meaningful-study streak." }),
  Object.freeze({ key: "streak_30", title: "30-Day Consistency", description: "Build a thirty-day meaningful-study streak." }),
  Object.freeze({ key: "syllabus_complete", title: "First Coverage Complete", description: "Complete first coverage of every applicable chapter in your selected syllabus." }),
]);

export function xpForEvent(eventType) {
  return Number(XP_RULES[eventType] ?? 0);
}

export function xpEventKey(eventType, sourceId, discriminator = "") {
  const type = String(eventType || "").trim();
  const source = String(sourceId || "").trim();
  const extra = String(discriminator || "").trim();
  if (!type || !source) throw new Error("XP event type and source ID are required.");
  return extra ? `${type}:${source}:${extra}` : `${type}:${source}`;
}

export function qualifiesMeaningfulStudy({ durationSeconds = 0, completedTodayTasks = 0 } = {}) {
  return Number(durationSeconds) >= MEANINGFUL_STUDY_SECONDS || Number(completedTodayTasks) >= 1;
}

export function safeTimezone(value) {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "Asia/Kolkata";
  }
}

export function localDateKey(instant, timezone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid instant for local-date calculation.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDateKey(key, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) throw new Error("Invalid date key.");
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

export function calculateStreakSummary(dateKeys, todayKey) {
  const unique = [...new Set((dateKeys ?? []).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(String(key))))].sort();
  const active = new Set(unique);
  let best = 0;
  let run = 0;
  let previous = null;
  for (const key of unique) {
    run = previous && shiftDateKey(previous, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }

  const today = String(todayKey);
  const yesterday = shiftDateKey(today, -1);
  let cursor = active.has(today) ? today : active.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && active.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { current, best, todayQualified: active.has(today) };
}

export function selectDailyBounded(rows, maxPerDay) {
  const limit = Math.max(0, Math.floor(Number(maxPerDay) || 0));
  const counts = new Map();
  const selected = [];
  for (const row of rows ?? []) {
    const day = String(row.localDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const count = counts.get(day) ?? 0;
    if (count >= limit) continue;
    counts.set(day, count + 1);
    selected.push(row);
  }
  return selected;
}

export function levelForXp(rawXp) {
  const totalXp = Math.max(0, Math.floor(Number(rawXp) || 0));
  let index = 0;
  for (let i = 0; i < PROFESSIONAL_LEVELS.length; i += 1) {
    if (totalXp >= PROFESSIONAL_LEVELS[i].minXp) index = i;
  }
  const current = PROFESSIONAL_LEVELS[index];
  const next = PROFESSIONAL_LEVELS[index + 1] ?? null;
  const progressPercent = next
    ? Math.max(0, Math.min(100, Math.round(((totalXp - current.minXp) / (next.minXp - current.minXp)) * 100)))
    : 100;
  return {
    ...current,
    totalXp,
    nextKey: next?.key ?? null,
    nextName: next?.name ?? null,
    nextMinXp: next?.minXp ?? null,
    progressPercent,
  };
}

export function achievementKeysForMetrics(metrics = {}) {
  const meaningfulSessionCount = Math.max(0, Number(metrics.meaningfulSessionCount) || 0);
  const studySeconds = Math.max(0, Number(metrics.studySeconds) || 0);
  const revisionCount = Math.max(0, Number(metrics.revisionCount) || 0);
  const testCount = Math.max(0, Number(metrics.testCount) || 0);
  const bestStreak = Math.max(0, Number(metrics.bestStreak) || 0);
  const syllabusComplete = metrics.syllabusComplete === true;
  const keys = [];
  if (meaningfulSessionCount >= 1) keys.push("first_session");
  if (studySeconds >= 10 * 3600) keys.push("study_10h");
  if (studySeconds >= 50 * 3600) keys.push("study_50h");
  if (studySeconds >= 100 * 3600) keys.push("study_100h");
  if (revisionCount >= 1) keys.push("first_revision");
  if (revisionCount >= 25) keys.push("revision_25");
  if (testCount >= 1) keys.push("first_test");
  if (testCount >= 10) keys.push("test_10");
  if (bestStreak >= 7) keys.push("streak_7");
  if (bestStreak >= 30) keys.push("streak_30");
  if (syllabusComplete) keys.push("syllabus_complete");
  return keys;
}

export function achievementDefinition(key) {
  return ACHIEVEMENT_DEFINITIONS.find((item) => item.key === key) ?? null;
}
