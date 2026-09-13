import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import {
  ACHIEVEMENT_DEFINITIONS,
  MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY,
  MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY,
  MEANINGFUL_STUDY_SECONDS,
  achievementDefinition,
  achievementKeysForMetrics,
  calculateStreakSummary,
  levelForXp,
  localDateKey,
  safeTimezone,
  selectDailyBounded,
  xpEventKey,
  xpForEvent,
} from "./policy.mjs";

type SessionRow = { id: string; duration_seconds: number; ended_at: string; timezone: string };
type TodayRow = { id: string; completed_at: string; timezone: string; estimated_minutes: number };
type ProgressRow = { chapter_id: string; completed_at: string | null; revision_1_at: string | null; revision_2_at: string | null };
type TestRow = { id: string; chapter_id: string; test_stage: string; attempt_number: number; completed_at: string };
type ReflectionRow = { session_id: string; reflection_saved_at: string; timezone: string };
type DoubtRow = { id: string; resolved_at: string; timezone: string };
type GoalRow = { id: string; goal_kind: "daily_study" | "weekly_study"; completed_at: string };
type TogetherRow = { id: string; completed_at: string; timezone: string };
type StreakDayRow = { local_date: string };
type XpLedgerRow = { event_type: string; xp_amount: number; occurred_at: string; source_id: string };
type AchievementRow = { achievement_key: string; unlocked_at: string };

type XpCandidate = {
  eventKey: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  xp: number;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

type StreakEvidence = {
  localDate: string;
  timezone: string;
  qualificationType: "valid_session" | "today_task";
  sourceId: string;
  qualifiedAt: string;
};

type LocalDated<T> = { row: T; localDate: string };

export type GamificationSummary = {
  totalXp: number;
  level: ReturnType<typeof levelForXp>;
  streak: {
    current: number;
    best: number;
    todayQualified: boolean;
    timezone: string;
    meaningfulStudyMinutes: number;
  };
  achievements: Array<{ key: string; title: string; description: string; unlockedAt: string }>;
  achievementCount: number;
  availableAchievementCount: number;
  recentXp: Array<{ eventType: string; xp: number; occurredAt: string; sourceId: string }>;
};

const MAX_REFLECTION_XP_EVENTS_PER_LOCAL_DAY = 3;
const MAX_RESOLVED_DOUBT_XP_EVENTS_PER_LOCAL_DAY = 3;
const MAX_DAILY_GOAL_XP_EVENTS_PER_LOCAL_DAY = 1;
const MAX_WEEKLY_GOAL_XP_EVENTS_PER_LOCAL_WEEK = 1;

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

function localWeekStartKey(localDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error("Invalid local date for week calculation.");
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function selectWeeklyBounded<T>(rows: LocalDated<T>[], maxPerWeek: number) {
  const counts = new Map<string, number>();
  const selected: LocalDated<T>[] = [];
  const limit = Math.max(0, Math.floor(Number(maxPerWeek) || 0));
  for (const row of rows) {
    const week = localWeekStartKey(row.localDate);
    const count = counts.get(week) ?? 0;
    if (count >= limit) continue;
    counts.set(week, count + 1);
    selected.push(row);
  }
  return selected;
}

async function insertXpCandidates(userId: string, candidates: XpCandidate[]) {
  if (!candidates.length) return;
  const db = getD1RuntimeDatabase();
  for (const rows of chunk(candidates, 45)) {
    const values = rows.map(() => "(?,?,?,?,?,?,?,?,?)").join(",");
    const bindings = rows.flatMap((item) => [
      `xp:${userId}:${item.eventKey}`,
      userId,
      item.eventKey,
      item.eventType,
      item.sourceType,
      item.sourceId,
      item.xp,
      item.occurredAt,
      JSON.stringify(item.metadata ?? {}),
    ]);
    await db.prepare(`INSERT OR IGNORE INTO xp_ledger(
      id,user_id,event_key,event_type,source_type,source_id,xp_amount,occurred_at,metadata
    ) VALUES ${values}`).bind(...bindings).run();
  }
}

async function insertStreakEvidence(userId: string, evidence: StreakEvidence[]) {
  if (!evidence.length) return;
  const db = getD1RuntimeDatabase();
  for (const rows of chunk(evidence, 75)) {
    const values = rows.map(() => "(?,?,?,?,?,?)").join(",");
    const bindings = rows.flatMap((item) => [userId, item.localDate, item.timezone, item.qualificationType, item.sourceId, item.qualifiedAt]);
    await db.prepare(`INSERT OR IGNORE INTO study_streak_days(
      user_id,local_date,source_timezone,qualification_type,source_id,qualified_at
    ) VALUES ${values}`).bind(...bindings).run();
  }
}

async function loadCanonicalSources(userId: string) {
  const db = getD1RuntimeDatabase();
  const [sessions, today, progress, tests, reflections, doubts, goals, together, profile] = await Promise.all([
    db.prepare(`SELECT id,duration_seconds,ended_at,timezone FROM study_sessions
      WHERE user_id=?1 AND duration_seconds>=?2
      ORDER BY ended_at ASC,id ASC LIMIT 5000`).bind(userId, MEANINGFUL_STUDY_SECONDS).all<SessionRow>(),
    db.prepare(`SELECT i.id,i.completed_at,i.estimated_minutes,p.timezone FROM daily_plan_items i
      JOIN daily_plans p ON p.id=i.plan_id AND p.user_id=i.user_id
      WHERE i.user_id=?1 AND i.status='completed' AND i.completed_at IS NOT NULL AND i.estimated_minutes>=10
      ORDER BY i.completed_at ASC,i.id ASC LIMIT 5000`).bind(userId).all<TodayRow>(),
    db.prepare(`SELECT chapter_id,completed_at,revision_1_at,revision_2_at FROM chapter_progress
      WHERE user_id=?1 AND (completed_at IS NOT NULL OR revision_1_at IS NOT NULL OR revision_2_at IS NOT NULL)
      ORDER BY chapter_id ASC`).bind(userId).all<ProgressRow>(),
    db.prepare(`SELECT id,chapter_id,test_stage,attempt_number,completed_at FROM test_attempts
      WHERE user_id=?1 AND attempt_number=1 ORDER BY completed_at ASC,id ASC LIMIT 5000`).bind(userId).all<TestRow>(),
    db.prepare(`SELECT phase.session_id,phase.reflection_saved_at,s.timezone
      FROM study_session_phase3 phase
      JOIN study_sessions s ON s.id=phase.session_id AND s.user_id=phase.user_id
      WHERE phase.user_id=?1 AND phase.reflection_saved_at IS NOT NULL AND s.duration_seconds>=?2
      ORDER BY phase.reflection_saved_at ASC,phase.session_id ASC LIMIT 5000`).bind(userId, MEANINGFUL_STUDY_SECONDS).all<ReflectionRow>(),
    db.prepare(`SELECT d.id,d.resolved_at,s.timezone
      FROM study_session_doubts d
      JOIN study_sessions s ON s.id=d.session_id AND s.user_id=d.user_id
      WHERE d.user_id=?1 AND d.status='resolved' AND d.resolved_at IS NOT NULL AND s.duration_seconds>=?2
      ORDER BY d.resolved_at ASC,d.id ASC LIMIT 5000`).bind(userId, MEANINGFUL_STUDY_SECONDS).all<DoubtRow>(),
    db.prepare(`SELECT g.id,e.goal_kind,g.completed_at FROM goals g
      JOIN planner_goal_phase8 e ON e.goal_id=g.id AND e.user_id=g.user_id
      WHERE g.user_id=?1 AND g.status='completed' AND g.completed_at IS NOT NULL AND e.goal_kind IN ('daily_study','weekly_study')
      ORDER BY g.completed_at ASC,g.id ASC LIMIT 5000`).bind(userId).all<GoalRow>(),
    db.prepare(`SELECT s.id,COALESCE(s.ended_at,MAX(p.completed_at)) AS completed_at,mine_session.timezone
      FROM study_together_sessions s
      JOIN study_together_participants mine ON mine.study_together_id=s.id AND mine.user_id=?1
      JOIN study_sessions mine_session ON mine_session.id=mine.canonical_study_session_id AND mine_session.user_id=mine.user_id
      JOIN study_together_participants p ON p.study_together_id=s.id
      JOIN study_sessions participant_session ON participant_session.id=p.canonical_study_session_id AND participant_session.user_id=p.user_id
      WHERE s.status='completed' AND mine.completed_at IS NOT NULL
        AND mine_session.duration_seconds>=?2 AND participant_session.duration_seconds>=?2
      GROUP BY s.id,s.ended_at,mine_session.timezone
      HAVING COUNT(*)=2
        AND SUM(CASE WHEN p.completed_at IS NOT NULL THEN 1 ELSE 0 END)=2
      ORDER BY completed_at ASC,s.id ASC LIMIT 2000`).bind(userId, MEANINGFUL_STUDY_SECONDS).all<TogetherRow>(),
    db.prepare("SELECT timezone FROM profiles WHERE user_id=?1 LIMIT 1").bind(userId).first<{ timezone: string | null }>(),
  ]);
  return {
    sessions: sessions.results ?? [],
    today: today.results ?? [],
    progress: progress.results ?? [],
    tests: tests.results ?? [],
    reflections: reflections.results ?? [],
    doubts: doubts.results ?? [],
    goals: goals.results ?? [],
    together: together.results ?? [],
    timezone: safeTimezone(profile?.timezone),
  };
}

function candidatesFromSources(sources: Awaited<ReturnType<typeof loadCanonicalSources>>) {
  const candidates: XpCandidate[] = [];
  const streakEvidence: StreakEvidence[] = [];

  const sessionDays = sources.sessions.flatMap((row) => validInstant(row.ended_at) ? [{ row, localDate: localDateKey(row.ended_at, row.timezone) }] : []);
  const boundedSessions = selectDailyBounded(sessionDays, MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY);
  const boundedSessionIds = new Set(boundedSessions.map((item) => item.row.id));
  for (const item of sessionDays) {
    const row = item.row;
    if (boundedSessionIds.has(row.id)) {
      candidates.push({
        eventKey: xpEventKey("valid_session", row.id),
        eventType: "valid_session",
        sourceType: "study_session",
        sourceId: row.id,
        xp: xpForEvent("valid_session"),
        occurredAt: row.ended_at,
        metadata: { localDate: item.localDate },
      });
    }
    streakEvidence.push({
      localDate: item.localDate,
      timezone: safeTimezone(row.timezone),
      qualificationType: "valid_session",
      sourceId: row.id,
      qualifiedAt: row.ended_at,
    });
  }

  const todayDays = sources.today.flatMap((row) => validInstant(row.completed_at) ? [{ row, localDate: localDateKey(row.completed_at, row.timezone) }] : []);
  const boundedToday = selectDailyBounded(todayDays, MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY);
  const boundedTodayIds = new Set(boundedToday.map((item) => item.row.id));
  for (const item of todayDays) {
    const row = item.row;
    if (boundedTodayIds.has(row.id)) {
      candidates.push({
        eventKey: xpEventKey("today_task", row.id),
        eventType: "today_task",
        sourceType: "daily_plan_item",
        sourceId: row.id,
        xp: xpForEvent("today_task"),
        occurredAt: row.completed_at,
        metadata: { localDate: item.localDate, estimatedMinutes: row.estimated_minutes },
      });
    }
    streakEvidence.push({
      localDate: item.localDate,
      timezone: safeTimezone(row.timezone),
      qualificationType: "today_task",
      sourceId: row.id,
      qualifiedAt: row.completed_at,
    });
  }

  for (const row of sources.progress) {
    if (validInstant(row.completed_at)) candidates.push({ eventKey: xpEventKey("chapter_completion", row.chapter_id), eventType: "chapter_completion", sourceType: "chapter_progress", sourceId: row.chapter_id, xp: xpForEvent("chapter_completion"), occurredAt: row.completed_at });
    if (validInstant(row.revision_1_at)) candidates.push({ eventKey: xpEventKey("revision_1", row.chapter_id), eventType: "revision_1", sourceType: "chapter_progress", sourceId: row.chapter_id, xp: xpForEvent("revision_1"), occurredAt: row.revision_1_at });
    if (validInstant(row.revision_2_at)) candidates.push({ eventKey: xpEventKey("revision_2", row.chapter_id), eventType: "revision_2", sourceType: "chapter_progress", sourceId: row.chapter_id, xp: xpForEvent("revision_2"), occurredAt: row.revision_2_at });
  }
  for (const row of sources.tests) if (validInstant(row.completed_at)) candidates.push({ eventKey: xpEventKey("test", row.id), eventType: "test", sourceType: "test_attempt", sourceId: row.id, xp: xpForEvent("test"), occurredAt: row.completed_at, metadata: { chapterId: row.chapter_id, testStage: row.test_stage, attemptNumber: row.attempt_number } });

  const reflectionDays = sources.reflections.flatMap((row) => validInstant(row.reflection_saved_at) ? [{ row, localDate: localDateKey(row.reflection_saved_at, row.timezone) }] : []);
  for (const item of selectDailyBounded(reflectionDays, MAX_REFLECTION_XP_EVENTS_PER_LOCAL_DAY)) {
    const row = item.row;
    candidates.push({ eventKey: xpEventKey("reflection", row.session_id), eventType: "reflection", sourceType: "study_session_reflection", sourceId: row.session_id, xp: xpForEvent("reflection"), occurredAt: row.reflection_saved_at, metadata: { localDate: item.localDate } });
  }

  const doubtDays = sources.doubts.flatMap((row) => validInstant(row.resolved_at) ? [{ row, localDate: localDateKey(row.resolved_at, row.timezone) }] : []);
  for (const item of selectDailyBounded(doubtDays, MAX_RESOLVED_DOUBT_XP_EVENTS_PER_LOCAL_DAY)) {
    const row = item.row;
    candidates.push({ eventKey: xpEventKey("resolved_doubt", row.id), eventType: "resolved_doubt", sourceType: "study_session_doubt", sourceId: row.id, xp: xpForEvent("resolved_doubt"), occurredAt: row.resolved_at, metadata: { localDate: item.localDate } });
  }

  const dailyGoalDays = sources.goals
    .filter((row) => row.goal_kind === "daily_study" && validInstant(row.completed_at))
    .map((row) => ({ row, localDate: localDateKey(row.completed_at, sources.timezone) }));
  for (const item of selectDailyBounded(dailyGoalDays, MAX_DAILY_GOAL_XP_EVENTS_PER_LOCAL_DAY)) {
    const row = item.row;
    candidates.push({ eventKey: xpEventKey("daily_goal", row.id), eventType: "daily_goal", sourceType: "planner_goal", sourceId: row.id, xp: xpForEvent("daily_goal"), occurredAt: row.completed_at, metadata: { goalKind: row.goal_kind, localDate: item.localDate } });
  }

  const weeklyGoalDays = sources.goals
    .filter((row) => row.goal_kind === "weekly_study" && validInstant(row.completed_at))
    .map((row) => ({ row, localDate: localDateKey(row.completed_at, sources.timezone) }));
  for (const item of selectWeeklyBounded(weeklyGoalDays, MAX_WEEKLY_GOAL_XP_EVENTS_PER_LOCAL_WEEK)) {
    const row = item.row;
    candidates.push({ eventKey: xpEventKey("weekly_goal", row.id), eventType: "weekly_goal", sourceType: "planner_goal", sourceId: row.id, xp: xpForEvent("weekly_goal"), occurredAt: row.completed_at, metadata: { goalKind: row.goal_kind, localDate: item.localDate, weekStart: localWeekStartKey(item.localDate) } });
  }

  for (const row of sources.together.filter((item) => validInstant(item.completed_at))) candidates.push({
    eventKey: xpEventKey("study_together", row.id),
    eventType: "study_together",
    sourceType: "study_together_session",
    sourceId: row.id,
    xp: xpForEvent("study_together"),
    occurredAt: row.completed_at,
    metadata: { localDate: localDateKey(row.completed_at, row.timezone) },
  });

  return { candidates, streakEvidence };
}

async function syllabusCompletion(userId: string) {
  const row = await getD1RuntimeDatabase().prepare(`SELECT
      COUNT(DISTINCT c.id) AS total_chapters,
      COUNT(DISTINCT CASE WHEN cp.completed_at IS NOT NULL THEN c.id END) AS completed_chapters
    FROM profiles p
    JOIN course_levels l ON l.code=p.ca_level
    JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
    JOIN course_groups g ON g.id=asm.group_id
    JOIN chapters c ON c.syllabus_version_id=asm.syllabus_version_id
    LEFT JOIN chapter_progress cp ON cp.user_id=p.user_id AND cp.chapter_id=c.id
    WHERE p.user_id=?1 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice)`)
    .bind(userId).first<{ total_chapters: number; completed_chapters: number }>();
  const total = Number(row?.total_chapters ?? 0);
  const completed = Number(row?.completed_chapters ?? 0);
  return total > 0 && completed >= total;
}

async function unlockAchievements(userId: string, keys: string[], metrics: Record<string, unknown>, now: Date) {
  if (!keys.length) return;
  const db = getD1RuntimeDatabase();
  const rows = keys.map((key) => ({ key, snapshot: JSON.stringify(metrics) }));
  for (const group of chunk(rows, 50)) {
    const values = group.map(() => "(?,?,?,?,?)").join(",");
    const bindings = group.flatMap((row) => [userId, row.key, now.toISOString(), row.snapshot, now.toISOString()]);
    await db.prepare(`INSERT OR IGNORE INTO user_achievements(user_id,achievement_key,unlocked_at,evidence_snapshot,created_at)
      VALUES ${values}`).bind(...bindings).run();
  }
}

export async function reconcileGamification(userId: string, now = new Date()) {
  const sources = await loadCanonicalSources(userId);
  const { candidates, streakEvidence } = candidatesFromSources(sources);
  await insertXpCandidates(userId, candidates);
  await insertStreakEvidence(userId, streakEvidence);

  const streakRows = await getD1RuntimeDatabase().prepare("SELECT local_date FROM study_streak_days WHERE user_id=?1 ORDER BY local_date ASC")
    .bind(userId).all<StreakDayRow>();
  const todayKey = localDateKey(now, sources.timezone);
  const streak = calculateStreakSummary((streakRows.results ?? []).map((row) => row.local_date), todayKey);
  const revisionCount = sources.progress.reduce((sum, row) => sum + (row.revision_1_at ? 1 : 0) + (row.revision_2_at ? 1 : 0), 0);
  const studySeconds = sources.sessions.reduce((sum, row) => sum + Math.max(0, Number(row.duration_seconds) || 0), 0);
  const metrics = {
    meaningfulSessionCount: sources.sessions.length,
    studySeconds,
    revisionCount,
    testCount: sources.tests.length,
    bestStreak: streak.best,
    syllabusComplete: await syllabusCompletion(userId),
  };
  await unlockAchievements(userId, achievementKeysForMetrics(metrics), metrics, now);
  return { timezone: sources.timezone, streak, studySeconds, candidateCount: candidates.length };
}

export async function getGamificationSummary(userId: string, now = new Date()): Promise<GamificationSummary> {
  const reconciled = await reconcileGamification(userId, now);
  const db = getD1RuntimeDatabase();
  const [totalRow, recentRows, achievementRows] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(xp_amount),0) AS total_xp FROM xp_ledger WHERE user_id=?1").bind(userId).first<{ total_xp: number }>(),
    db.prepare(`SELECT event_type,xp_amount,occurred_at,source_id FROM xp_ledger
      WHERE user_id=?1 ORDER BY occurred_at DESC,event_key DESC LIMIT 20`).bind(userId).all<XpLedgerRow>(),
    db.prepare(`SELECT achievement_key,unlocked_at FROM user_achievements
      WHERE user_id=?1 ORDER BY unlocked_at DESC,achievement_key ASC`).bind(userId).all<AchievementRow>(),
  ]);
  const totalXp = Number(totalRow?.total_xp ?? 0);
  const unlocked = (achievementRows.results ?? []).map((row) => {
    const definition = achievementDefinition(row.achievement_key);
    return {
      key: row.achievement_key,
      title: definition?.title ?? row.achievement_key,
      description: definition?.description ?? "Achievement unlocked.",
      unlockedAt: row.unlocked_at,
    };
  });
  return {
    totalXp,
    level: levelForXp(totalXp),
    streak: {
      ...reconciled.streak,
      timezone: reconciled.timezone,
      meaningfulStudyMinutes: Math.floor(reconciled.studySeconds / 60),
    },
    achievements: unlocked,
    achievementCount: unlocked.length,
    availableAchievementCount: ACHIEVEMENT_DEFINITIONS.length,
    recentXp: (recentRows.results ?? []).map((row) => ({ eventType: row.event_type, xp: Number(row.xp_amount), occurredAt: row.occurred_at, sourceId: row.source_id })),
  };
}
