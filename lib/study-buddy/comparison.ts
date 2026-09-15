import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export type StudyBuddyComparisonItem = {
  relationshipId: string;
  userId: string;
  displayName: string;
  todayStudyMinutes: number | null;
  weekStudyMinutes: number | null;
  weeklyTargetMinutes: number | null;
  currentStreakDays: number | null;
};

type RelationshipComparisonRow = {
  relationship_id: string;
  buddy_user_id: string;
  display_name: string | null;
  timezone: string | null;
  buddy_share_progress: number;
  buddy_share_streak: number;
  buddy_share_goals: number;
  owner_share_goals: number;
};

type SessionRow = { ended_at: string; duration_seconds: number };

function safeTimezone(value: string | null | undefined) {
  if (!value) return "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "Asia/Kolkata";
  }
}

function parseD1Date(value: string) {
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value);
  return new Date(value.includes("T") ? `${value}Z` : `${value.replace(" ", "T")}Z`);
}

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sessionSummary(rows: SessionRow[], timezone: string, now = new Date()) {
  const today = localDateKey(now, timezone);
  const weekFloor = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  let todaySeconds = 0;
  let weekSeconds = 0;
  const activeDays = new Set<string>();

  for (const row of rows) {
    const endedAt = parseD1Date(row.ended_at);
    if (!Number.isFinite(endedAt.getTime())) continue;
    const seconds = Math.max(0, Number(row.duration_seconds) || 0);
    const key = localDateKey(endedAt, timezone);
    activeDays.add(key);
    if (key === today) todaySeconds += seconds;
    if (endedAt.getTime() >= weekFloor) weekSeconds += seconds;
  }

  const yesterday = shiftDateKey(today, -1);
  let cursor = activeDays.has(today) ? today : activeDays.has(yesterday) ? yesterday : null;
  let currentStreakDays = 0;
  while (cursor && activeDays.has(cursor)) {
    currentStreakDays += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return {
    todayStudyMinutes: Math.floor(todaySeconds / 60),
    weekStudyMinutes: Math.floor(weekSeconds / 60),
    currentStreakDays,
  };
}

export async function getStudyBuddyComparison(ownerUserId: string, now = new Date()): Promise<StudyBuddyComparisonItem[]> {
  const db = getD1RuntimeDatabase();
  const relationships = await db.prepare(`SELECT
      r.id AS relationship_id,
      CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END AS buddy_user_id,
      p.display_name,
      p.timezone,
      COALESCE(buddy_share.share_progress,0) AS buddy_share_progress,
      COALESCE(buddy_share.share_streak,0) AS buddy_share_streak,
      COALESCE(buddy_share.share_goals,0) AS buddy_share_goals,
      COALESCE(owner_share.share_goals,0) AS owner_share_goals
    FROM study_buddy_relationships r
    JOIN profiles p ON p.user_id=CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END
    LEFT JOIN study_buddy_sharing buddy_share
      ON buddy_share.relationship_id=r.id
      AND buddy_share.owner_user_id=CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END
    LEFT JOIN study_buddy_sharing owner_share ON owner_share.relationship_id=r.id AND owner_share.owner_user_id=?1
    WHERE r.status='accepted'
      AND (r.member_a_user_id=?1 OR r.member_b_user_id=?1)
      AND NOT EXISTS (
        SELECT 1 FROM study_buddy_safety s
        WHERE ((s.owner_user_id=?1 AND s.target_user_id=CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END)
          OR (s.target_user_id=?1 AND s.owner_user_id=CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END))
          AND s.blocked=1
      )
    ORDER BY r.responded_at DESC,r.id DESC`)
    .bind(ownerUserId).all<RelationshipComparisonRow>();

  const items: StudyBuddyComparisonItem[] = [];
  for (const relationship of relationships.results ?? []) {
    let todayStudyMinutes: number | null = null;
    let weekStudyMinutes: number | null = null;
    let currentStreakDays: number | null = null;

    if (relationship.buddy_share_progress === 1 || relationship.buddy_share_streak === 1) {
      const sessions = await db.prepare(`SELECT ended_at,duration_seconds FROM study_sessions
        WHERE user_id=?1 AND ended_at>=datetime('now','-120 days') ORDER BY ended_at DESC LIMIT 2000`)
        .bind(relationship.buddy_user_id).all<SessionRow>();
      const summary = sessionSummary(sessions.results ?? [], relationship.timezone ?? "Asia/Kolkata", now);
      if (relationship.buddy_share_progress === 1) {
        todayStudyMinutes = summary.todayStudyMinutes;
        weekStudyMinutes = summary.weekStudyMinutes;
      }
      if (relationship.buddy_share_streak === 1) currentStreakDays = summary.currentStreakDays;
    }

    let weeklyTargetMinutes: number | null = null;
    if (relationship.buddy_share_goals === 1 && relationship.owner_share_goals === 1) {
      const goal = await db.prepare(`SELECT target_minutes_per_person FROM study_buddy_goals
        WHERE relationship_id=?1 AND status='active'
          AND date(week_start)<=date('now') AND date(week_start,'+7 days')>date('now')
        ORDER BY created_at DESC LIMIT 1`)
        .bind(relationship.relationship_id).first<{ target_minutes_per_person: number }>();
      if (goal) weeklyTargetMinutes = Number(goal.target_minutes_per_person);
    }

    items.push({
      relationshipId: relationship.relationship_id,
      userId: relationship.buddy_user_id,
      displayName: relationship.display_name ?? "Study buddy",
      todayStudyMinutes,
      weekStudyMinutes,
      weeklyTargetMinutes,
      currentStreakDays,
    });
  }

  return items;
}
