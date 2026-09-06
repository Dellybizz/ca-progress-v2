import "server-only";

import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import type { ProgressStage, ProgressState } from "@/lib/progress/types";
import type {
  ChapterHubAcademic,
  ChapterHubDoubtChannel,
  ChapterHubFile,
  ChapterHubModel,
  ChapterHubNote,
  ChapterHubOfficialResource,
  ChapterHubProgressEvent,
  ChapterHubStudySession,
  ChapterHubTopic,
} from "./types";

const EMPTY_PROGRESS: ProgressState = {
  completed_at: null,
  revision_1_at: null,
  revision_2_at: null,
  test_1_at: null,
  test_2_at: null,
};

type AcademicRow = {
  chapter_id: string;
  chapter_number: string;
  chapter_title: string;
  chapter_kind: string;
  section_key: string | null;
  stable_key: string;
  subject_id: string;
  subject_slug: string;
  subject_title: string;
  paper_label: string;
  level_id: string;
  level_code: string;
  level_name: string;
  group_id: string;
  group_code: string;
  group_name: string;
  syllabus_version_id: string;
  syllabus_version_key: string;
  syllabus_version_title: string;
};

type ProgressRow = ProgressState & { updated_at: string | null };
type ProgressEventRow = { id: string; stage: string; action: string; created_at: string };
type StudyRow = { id: string; started_at: string; ended_at: string; duration_seconds: number; mode: string };
type StudyAggregateRow = { total_seconds: number | null; session_count: number | null };
type NoteRow = { id: string; title: string; body_text: string; updated_at: string };
type FileRow = { id: string; title: string; original_filename: string; extension: string; size_bytes: number; updated_at: string };
type ChannelRow = { id: string; channel_key: string; title: string; description: string };
type TopicRow = { id: string; unit_number: string | null; title: string; topic_kind: string };
type OfficialRow = { canonical_resource_id: string; title: string; resource_type: string; source_name: string; published_on: string | null; last_seen_at: string };

function viewerLabel(name: string | null, email: string | null, phone: string | null) {
  return name?.trim() || email || phone || "Student";
}

function excerpt(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

function academicDto(row: AcademicRow): ChapterHubAcademic {
  return {
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    chapterTitle: row.chapter_title,
    chapterKind: row.chapter_kind,
    sectionKey: row.section_key,
    stableKey: row.stable_key,
    subjectId: row.subject_id,
    subjectSlug: row.subject_slug,
    subjectTitle: row.subject_title,
    paperLabel: row.paper_label,
    levelId: row.level_id,
    levelCode: row.level_code,
    levelName: row.level_name,
    groupId: row.group_id,
    groupCode: row.group_code,
    groupName: row.group_name,
    syllabusVersionId: row.syllabus_version_id,
    syllabusVersionKey: row.syllabus_version_key,
    syllabusVersionTitle: row.syllabus_version_title,
  };
}

function profileReady(profile: Awaited<ReturnType<typeof getProfileForUser>>) {
  return Boolean(
    profile?.onboarding_completed_at
      && isCALevel(profile.ca_level)
      && isGroupChoice(profile.group_choice)
      && profile.attempt_key
      && profile.attempt_key !== "undecided",
  );
}

export async function getChapterHubModel(chapterId: string): Promise<ChapterHubModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };

  const profile = await getProfileForUser(identity.id);
  const name = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!profileReady(profile) || !profile || !isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key) {
    return { mode: "setup", viewerName: name };
  }

  const cleanChapterId = chapterId.trim();
  if (!cleanChapterId || cleanChapterId.length > 160) return { mode: "missing" };
  const db = getD1RuntimeDatabase();

  const academicRow = await db.prepare(`
    SELECT
      c.id AS chapter_id,
      c.chapter_number,
      c.title AS chapter_title,
      c.chapter_kind,
      c.section_key,
      c.stable_key,
      s.id AS subject_id,
      s.slug AS subject_slug,
      s.title AS subject_title,
      s.paper_label,
      l.id AS level_id,
      l.code AS level_code,
      l.name AS level_name,
      g.id AS group_id,
      g.code AS group_code,
      g.name AS group_name,
      sv.id AS syllabus_version_id,
      sv.version_key AS syllabus_version_key,
      sv.title AS syllabus_version_title
    FROM chapters c
    JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id
    JOIN subjects s ON s.id=sv.subject_id
    JOIN course_levels l ON l.id=s.level_id
    JOIN course_groups g ON g.id=s.group_id
    WHERE c.id=?1 AND s.is_active=1 AND l.is_active=1 AND g.is_active=1
    LIMIT 1
  `).bind(cleanChapterId).first<AcademicRow>();
  if (!academicRow) return { mode: "missing" };

  // The canonical ID is addressable globally, but a student's workspace may only
  // reveal chapters that are part of the active level/group/attempt selection.
  const applicable = await db.prepare(`
    SELECT 1 AS ok
    FROM attempt_syllabus_map asm
    WHERE asm.level_id=?1
      AND asm.group_id=?2
      AND asm.subject_id=?3
      AND asm.syllabus_version_id=?4
      AND asm.attempt_key=?5
    LIMIT 1
  `).bind(
    academicRow.level_id,
    academicRow.group_id,
    academicRow.subject_id,
    academicRow.syllabus_version_id,
    profile.attempt_key,
  ).first<{ ok: number }>();

  const groupAllowed = profile.ca_level === "foundation"
    || profile.group_choice === "both"
    || profile.group_choice === "not_applicable"
    || profile.group_choice === academicRow.group_code;
  if (!applicable || profile.ca_level !== academicRow.level_code || !groupAllowed) return { mode: "scope_mismatch" };

  const [progressRow, progressEventsResult, studyResult, studyAggregate, notesResult, filesResult, channelsResult, topicsResult, officialResult] = await Promise.all([
    db.prepare(`SELECT completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,updated_at FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2 LIMIT 1`)
      .bind(identity.id, cleanChapterId).first<ProgressRow>(),
    db.prepare(`SELECT id,stage,action,created_at FROM progress_events WHERE user_id=?1 AND chapter_id=?2 ORDER BY created_at DESC LIMIT 10`)
      .bind(identity.id, cleanChapterId).all<ProgressEventRow>(),
    db.prepare(`SELECT id,started_at,ended_at,duration_seconds,mode FROM study_sessions WHERE user_id=?1 AND chapter_id=?2 ORDER BY ended_at DESC LIMIT 8`)
      .bind(identity.id, cleanChapterId).all<StudyRow>(),
    db.prepare(`SELECT COALESCE(SUM(duration_seconds),0) AS total_seconds,COUNT(*) AS session_count FROM study_sessions WHERE user_id=?1 AND chapter_id=?2`)
      .bind(identity.id, cleanChapterId).first<StudyAggregateRow>(),
    db.prepare(`SELECT id,title,body_text,updated_at FROM notes WHERE user_id=?1 AND chapter_id=?2 ORDER BY updated_at DESC LIMIT 6`)
      .bind(identity.id, cleanChapterId).all<NoteRow>(),
    db.prepare(`SELECT id,title,original_filename,extension,size_bytes,updated_at FROM uploaded_resources WHERE owner_user_id=?1 AND chapter_id=?2 ORDER BY updated_at DESC LIMIT 6`)
      .bind(identity.id, cleanChapterId).all<FileRow>(),
    db.prepare(`SELECT id,channel_key,title,description FROM community_channels WHERE subject_id=?1 AND is_active=1 ORDER BY sort_order LIMIT 6`)
      .bind(academicRow.subject_id).all<ChannelRow>(),
    db.prepare(`SELECT id,unit_number,title,topic_kind FROM topics WHERE chapter_id=?1 ORDER BY sort_order LIMIT 120`)
      .bind(cleanChapterId).all<TopicRow>(),
    db.prepare(`
      SELECT
        a.canonical_resource_id,
        r.title,
        r.resource_type,
        s.name AS source_name,
        r.published_on,
        r.last_seen_at
      FROM autofetch_resource_records a
      JOIN icai_resources r ON r.id=a.resource_row_id
      JOIN icai_sources s ON s.id=r.source_id
      JOIN resource_subject_map rsm ON rsm.resource_id=r.id
      WHERE a.is_current=1
        AND a.health_status NOT IN ('broken','review_required')
        AND r.status='active'
        AND r.verification_status='verified'
        AND rsm.subject_id=?1
        AND (
          NOT EXISTS (SELECT 1 FROM resource_attempt_map ram0 WHERE ram0.resource_id=r.id)
          OR EXISTS (
            SELECT 1
            FROM resource_attempt_map ram
            JOIN exam_attempts ea ON ea.id=ram.attempt_id
            WHERE ram.resource_id=r.id AND ea.attempt_key=?2 AND ea.verification_status='verified'
          )
        )
      ORDER BY COALESCE(r.published_on,r.last_seen_at) DESC
      LIMIT 12
    `).bind(academicRow.subject_id, profile.attempt_key).all<OfficialRow>(),
  ]);

  const progress: ProgressState = progressRow ? {
    completed_at: progressRow.completed_at,
    revision_1_at: progressRow.revision_1_at,
    revision_2_at: progressRow.revision_2_at,
    test_1_at: progressRow.test_1_at,
    test_2_at: progressRow.test_2_at,
  } : EMPTY_PROGRESS;

  const progressEvents: ChapterHubProgressEvent[] = (progressEventsResult.results ?? []).map((row) => ({
    id: row.id,
    stage: row.stage as ProgressStage,
    action: row.action,
    createdAt: row.created_at,
  }));
  const recentSessions: ChapterHubStudySession[] = (studyResult.results ?? []).map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: Number(row.duration_seconds),
    mode: row.mode,
  }));
  const notes: ChapterHubNote[] = (notesResult.results ?? []).map((row) => ({ id: row.id, title: row.title, excerpt: excerpt(row.body_text), updatedAt: row.updated_at }));
  const files: ChapterHubFile[] = (filesResult.results ?? []).map((row) => ({ id: row.id, title: row.title, filename: row.original_filename, extension: row.extension, sizeBytes: Number(row.size_bytes), updatedAt: row.updated_at }));
  const doubtChannels: ChapterHubDoubtChannel[] = (channelsResult.results ?? []).map((row) => ({ id: row.id, channelKey: row.channel_key, title: row.title, description: row.description }));
  const topics: ChapterHubTopic[] = (topicsResult.results ?? []).map((row) => ({ id: row.id, unitNumber: row.unit_number, title: row.title, kind: row.topic_kind }));
  const officialResources: ChapterHubOfficialResource[] = (officialResult.results ?? []).map((row) => ({
    canonicalResourceId: row.canonical_resource_id,
    title: row.title,
    resourceType: row.resource_type,
    sourceName: row.source_name,
    publishedOn: row.published_on,
    lastVerifiedAt: row.last_seen_at,
  }));

  return {
    mode: "ready",
    viewerName: name,
    attemptKey: profile.attempt_key,
    academic: academicDto(academicRow),
    topics,
    progress,
    progressUpdatedAt: progressRow?.updated_at ?? null,
    progressEvents,
    study: {
      totalSeconds: Number(studyAggregate?.total_seconds ?? 0),
      sessionCount: Number(studyAggregate?.session_count ?? 0),
      recentSessions,
    },
    notes,
    files,
    doubtChannels,
    officialResources,
  };
}
