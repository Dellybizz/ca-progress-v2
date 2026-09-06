import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import {
  PRIVATE_STUDY_PROFILE_DEFAULTS,
  STUDY_PROFILE_VISIBILITIES,
  canViewStudyProfileScope,
  normalizeStudyProfileVisibility,
  serializeStudyProfile,
} from "./study-profile-policy.mjs";

export type StudyProfileVisibility = "private" | "buddies" | "public";
export type StudyProfileRelationship = "owner" | "buddy" | "public";

export type OwnerStudyProfileSettings = {
  publicBio: string;
  profileVisibility: StudyProfileVisibility;
  progressVisibility: StudyProfileVisibility;
  streakVisibility: StudyProfileVisibility;
  showLevel: boolean;
  showAttempt: boolean;
  buddyUserIds: string[];
};

type SettingsRow = {
  public_bio: string | null;
  profile_visibility: string | null;
  progress_visibility: string | null;
  streak_visibility: string | null;
  show_level: number | null;
  show_attempt: number | null;
};

type BaseProfileRow = SettingsRow & {
  user_id: string;
  display_name: string | null;
  ca_level: string | null;
  attempt_key: string | null;
  timezone: string | null;
};

type ProgressAggregate = {
  total_chapters: number;
  completed_chapters: number;
  revision_1_chapters: number;
  test_1_chapters: number;
};

type SessionDateRow = { ended_at: string };

type StudyProfileViewerAccess = {
  relationship: StudyProfileRelationship;
  shareProfile: boolean;
  shareProgress: boolean;
  shareStreak: boolean;
};

export class StudyProfileInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudyProfileInputError";
  }
}

function asVisibility(value: unknown): StudyProfileVisibility {
  if (typeof value !== "string" || !STUDY_PROFILE_VISIBILITIES.includes(value)) {
    throw new StudyProfileInputError("Visibility must be private, buddies, or public.");
  }
  return value as StudyProfileVisibility;
}

function settingsFromRow(row: SettingsRow | null | undefined) {
  return {
    publicBio: row?.public_bio ?? "",
    profileVisibility: normalizeStudyProfileVisibility(row?.profile_visibility) as StudyProfileVisibility,
    progressVisibility: normalizeStudyProfileVisibility(row?.progress_visibility) as StudyProfileVisibility,
    streakVisibility: normalizeStudyProfileVisibility(row?.streak_visibility) as StudyProfileVisibility,
    showLevel: row?.show_level === 1,
    showAttempt: row?.show_attempt === 1,
  };
}

function normalizeBio(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new StudyProfileInputError("Public bio must be text.");
  const bio = value.trim();
  if (bio.length > 240) throw new StudyProfileInputError("Public bio must be 240 characters or fewer.");
  return bio;
}

function normalizeBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new StudyProfileInputError(`${label} must be true or false.`);
  return value;
}

function normalizeUserId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new StudyProfileInputError("Invalid buddy user ID.");
  return id;
}

function safeTimezone(value: string | null | undefined) {
  if (!value) return "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "Asia/Kolkata";
  }
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

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function streakSummary(rows: SessionDateRow[], timezone: string, now = new Date()) {
  const active = new Set(rows.map((row) => localDateKey(new Date(row.ended_at), timezone)));
  const today = localDateKey(now, timezone);
  const yesterday = shiftDateKey(today, -1);
  const fourteenDayStart = shiftDateKey(today, -13);
  const activeDaysLast14 = [...active].filter((key) => key >= fourteenDayStart && key <= today).length;
  let cursor = active.has(today) ? today : active.has(yesterday) ? yesterday : null;
  let currentStreakDays = 0;
  while (cursor && active.has(cursor)) {
    currentStreakDays += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { currentStreakDays, activeDaysLast14 };
}

async function relationshipForViewer(targetUserId: string, viewerUserId: string | null): Promise<StudyProfileViewerAccess> {
  if (viewerUserId === targetUserId) {
    return { relationship: "owner", shareProfile: true, shareProgress: true, shareStreak: true };
  }
  if (!viewerUserId) {
    return { relationship: "public", shareProfile: false, shareProgress: false, shareStreak: false };
  }
  const row = await getD1RuntimeDatabase().prepare(`SELECT
      COALESCE(sh.share_profile,0) AS share_profile,
      COALESCE(sh.share_progress,0) AS share_progress,
      COALESCE(sh.share_streak,0) AS share_streak
    FROM study_buddy_relationships r
    LEFT JOIN study_buddy_sharing sh ON sh.relationship_id=r.id AND sh.owner_user_id=?1
    WHERE r.status='accepted'
      AND ((r.member_a_user_id=?1 AND r.member_b_user_id=?2) OR (r.member_a_user_id=?2 AND r.member_b_user_id=?1))
      AND NOT EXISTS (
        SELECT 1 FROM study_buddy_safety s
        WHERE ((s.owner_user_id=?1 AND s.target_user_id=?2) OR (s.owner_user_id=?2 AND s.target_user_id=?1))
          AND s.blocked=1
      )
    LIMIT 1`)
    .bind(targetUserId, viewerUserId).first<{ share_profile: number; share_progress: number; share_streak: number }>();
  if (!row) return { relationship: "public", shareProfile: false, shareProgress: false, shareStreak: false };
  return {
    relationship: "buddy",
    shareProfile: row.share_profile === 1,
    shareProgress: row.share_progress === 1,
    shareStreak: row.share_streak === 1,
  };
}

async function acceptedStudyBuddyIds(userId: string) {
  const rows = await getD1RuntimeDatabase().prepare(`SELECT
      CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END AS buddy_user_id
    FROM study_buddy_relationships r
    WHERE r.status='accepted'
      AND (r.member_a_user_id=?1 OR r.member_b_user_id=?1)
      AND NOT EXISTS (
        SELECT 1 FROM study_buddy_safety s
        WHERE ((s.owner_user_id=?1 AND s.target_user_id=CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END)
          OR (s.target_user_id=?1 AND s.owner_user_id=CASE WHEN r.member_a_user_id=?1 THEN r.member_b_user_id ELSE r.member_a_user_id END))
          AND s.blocked=1
      )
    ORDER BY r.responded_at ASC,r.id ASC`)
    .bind(userId).all<{ buddy_user_id: string }>();
  return (rows.results ?? []).map((item) => item.buddy_user_id);
}

export async function getOwnerStudyProfileSettings(userId: string): Promise<OwnerStudyProfileSettings> {
  const db = getD1RuntimeDatabase();
  const [row, buddyUserIds] = await Promise.all([
    db.prepare("SELECT public_bio,profile_visibility,progress_visibility,streak_visibility,show_level,show_attempt FROM study_profiles WHERE user_id=?1 LIMIT 1")
      .bind(userId).first<SettingsRow>(),
    acceptedStudyBuddyIds(userId),
  ]);
  return { ...settingsFromRow(row), buddyUserIds };
}

export async function saveOwnerStudyProfileSettings(userId: string, input: Record<string, unknown>) {
  const publicBio = normalizeBio(input.publicBio);
  const profileVisibility = asVisibility(input.profileVisibility);
  const progressVisibility = asVisibility(input.progressVisibility);
  const streakVisibility = asVisibility(input.streakVisibility);
  const showLevel = normalizeBoolean(input.showLevel, "Show level");
  const showAttempt = normalizeBoolean(input.showAttempt, "Show attempt");
  const db = getD1RuntimeDatabase();
  await db.prepare(`INSERT INTO study_profiles(user_id,public_bio,profile_visibility,progress_visibility,streak_visibility,show_level,show_attempt)
    VALUES(?1,?2,?3,?4,?5,?6,?7)
    ON CONFLICT(user_id) DO UPDATE SET public_bio=excluded.public_bio,profile_visibility=excluded.profile_visibility,
      progress_visibility=excluded.progress_visibility,streak_visibility=excluded.streak_visibility,
      show_level=excluded.show_level,show_attempt=excluded.show_attempt,updated_at=CURRENT_TIMESTAMP`)
    .bind(userId, publicBio || null, profileVisibility, progressVisibility, streakVisibility, showLevel ? 1 : 0, showAttempt ? 1 : 0).run();
  return getOwnerStudyProfileSettings(userId);
}

export async function grantStudyProfileBuddy(ownerUserId: string, rawBuddyUserId: unknown) {
  const buddyUserId = normalizeUserId(rawBuddyUserId);
  if (buddyUserId === ownerUserId) throw new StudyProfileInputError("You cannot add yourself as a study buddy.");
  const relationship = await getD1RuntimeDatabase().prepare(`SELECT 1 AS ok FROM study_buddy_relationships r
    WHERE r.status='accepted'
      AND ((r.member_a_user_id=?1 AND r.member_b_user_id=?2) OR (r.member_a_user_id=?2 AND r.member_b_user_id=?1))
    LIMIT 1`)
    .bind(ownerUserId, buddyUserId).first<{ ok: number }>();
  if (!relationship) throw new StudyProfileInputError("Accept the Study Buddy request before buddy-visible profile access is available.");
  return getOwnerStudyProfileSettings(ownerUserId);
}

export async function revokeStudyProfileBuddy(ownerUserId: string, rawBuddyUserId: unknown) {
  const buddyUserId = normalizeUserId(rawBuddyUserId);
  await getD1RuntimeDatabase().prepare("DELETE FROM study_profile_buddies WHERE owner_user_id=?1 AND buddy_user_id=?2")
    .bind(ownerUserId, buddyUserId).run();
  return getOwnerStudyProfileSettings(ownerUserId);
}

export async function getStudyProfileForViewer(targetUserId: string, viewerUserId: string | null, now = new Date()) {
  const targetId = normalizeUserId(targetUserId);
  const db = getD1RuntimeDatabase();
  const row = await db.prepare(`SELECT p.user_id,p.display_name,p.ca_level,p.attempt_key,p.timezone,
      sp.public_bio,sp.profile_visibility,sp.progress_visibility,sp.streak_visibility,sp.show_level,sp.show_attempt
    FROM profiles p LEFT JOIN study_profiles sp ON sp.user_id=p.user_id
    JOIN app_users u ON u.user_id=p.user_id AND u.account_state='active'
    WHERE p.user_id=?1 LIMIT 1`).bind(targetId).first<BaseProfileRow>();
  if (!row) return null;

  const access = await relationshipForViewer(targetId, viewerUserId);
  const relationship = access.relationship;
  const settings = settingsFromRow(row);
  if (!canViewStudyProfileScope(settings.profileVisibility, relationship)) return null;
  if (relationship === "buddy" && settings.profileVisibility === "buddies" && !access.shareProfile) return null;

  let progress: { firstCoveragePercent: number; revisionReadinessPercent: number; testingReadinessPercent: number } | undefined;
  const progressPermitted = relationship !== "buddy" || settings.progressVisibility !== "buddies" || access.shareProgress;
  if (progressPermitted && canViewStudyProfileScope(settings.progressVisibility, relationship)) {
    const aggregate = await db.prepare(`SELECT COUNT(DISTINCT c.id) AS total_chapters,
        COUNT(DISTINCT CASE WHEN cp.completed_at IS NOT NULL THEN c.id END) AS completed_chapters,
        COUNT(DISTINCT CASE WHEN cp.revision_1_at IS NOT NULL THEN c.id END) AS revision_1_chapters,
        COUNT(DISTINCT CASE WHEN cp.test_1_at IS NOT NULL THEN c.id END) AS test_1_chapters
      FROM profiles p
      JOIN course_levels l ON l.code=p.ca_level
      JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
      JOIN course_groups g ON g.id=asm.group_id
      JOIN chapters c ON c.syllabus_version_id=asm.syllabus_version_id
      LEFT JOIN chapter_progress cp ON cp.user_id=p.user_id AND cp.chapter_id=c.id
      WHERE p.user_id=?1 AND p.onboarding_completed_at IS NOT NULL
        AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice)`)
      .bind(targetId).first<ProgressAggregate>();
    const total = Number(aggregate?.total_chapters ?? 0);
    progress = {
      firstCoveragePercent: percent(Number(aggregate?.completed_chapters ?? 0), total),
      revisionReadinessPercent: percent(Number(aggregate?.revision_1_chapters ?? 0), total),
      testingReadinessPercent: percent(Number(aggregate?.test_1_chapters ?? 0), total),
    };
  }

  let streak: { currentStreakDays: number; activeDaysLast14: number } | undefined;
  const streakPermitted = relationship !== "buddy" || settings.streakVisibility !== "buddies" || access.shareStreak;
  if (streakPermitted && canViewStudyProfileScope(settings.streakVisibility, relationship)) {
    const sessions = await db.prepare("SELECT ended_at FROM study_sessions WHERE user_id=?1 AND ended_at>=datetime('now','-120 days') ORDER BY ended_at DESC LIMIT 2000")
      .bind(targetId).all<SessionDateRow>();
    streak = streakSummary(sessions.results ?? [], row.timezone ?? "Asia/Kolkata", now);
  }

  return serializeStudyProfile({
    relationship,
    settings,
    source: {
      userId: row.user_id,
      displayName: row.display_name,
      publicBio: settings.publicBio,
      caLevel: row.ca_level,
      attemptKey: row.attempt_key,
      progress,
      streak,
    },
  });
}

export { PRIVATE_STUDY_PROFILE_DEFAULTS };
