import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import type { ProgressState } from "@/lib/progress/types";
import { TEST_PROGRESS_STAGES, type TestProgressStage } from "./types";
import {
  TEST_ATTACHMENT_KINDS,
  TEST_MISTAKE_CATEGORIES,
  type TestArchiveModel,
  type TestAttempt,
  type TestAttemptAttachment,
  type TestAttemptMistake,
  type TestAttemptSaveResult,
  type TestAttachmentKind,
  type TestJournalEntry,
  type TestMistakeCategory,
} from "./phase5-types";

const EMPTY_PROGRESS: ProgressState = {
  completed_at: null,
  revision_1_at: null,
  revision_2_at: null,
  test_1_at: null,
  test_2_at: null,
};

type AttemptRow = {
  id: string;
  subject_id: string;
  subject_title: string;
  chapter_id: string;
  chapter_title: string;
  chapter_number: string;
  test_stage: TestProgressStage;
  attempt_number: number;
  marks_scored: number;
  marks_total: number;
  percentage: number;
  duration_minutes: number | null;
  completed_at: string;
  progress_event_id: string | null;
  created_at: string;
};
type MistakeRow = { id: string; attempt_id: string; category: TestMistakeCategory; note: string | null; created_at: string };
type AttachmentRow = { id: string; attempt_id: string; attachment_kind: TestAttachmentKind; filename: string; mime_type: string; size_bytes: number; created_at: string };
type ProgressRow = ProgressState & { updated_at: string | null };

function cleanId(value: unknown, label = "id") {
  if (typeof value !== "string") throw new Error(`Choose a valid ${label}.`);
  const clean = value.trim();
  if (!clean || clean.length > 180) throw new Error(`Choose a valid ${label}.`);
  return clean;
}

function parseStage(value: unknown): TestProgressStage {
  if (typeof value !== "string" || !(TEST_PROGRESS_STAGES as readonly string[]).includes(value)) throw new Error("Choose Test 1 or Test 2.");
  return value as TestProgressStage;
}

function parseMarks(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) throw new Error(`${label} must be a valid number.`);
  return Math.round(parsed * 100) / 100;
}

function parseDuration(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) throw new Error("Duration must be between 1 and 1440 minutes.");
  return parsed;
}

function parseCompletedOn(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid test completion date.");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid test completion date.");
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  if (date >= tomorrow) throw new Error("A completed test cannot be dated in the future.");
  return date.toISOString();
}

function parseMistakes(value: unknown) {
  if (!Array.isArray(value)) return [] as TestMistakeCategory[];
  const allowed = new Set<string>(TEST_MISTAKE_CATEGORIES);
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))] as TestMistakeCategory[];
}

function parseNote(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, 1200) : null;
}

function stateFromRow(row: ProgressRow | null): ProgressState {
  if (!row) return { ...EMPTY_PROGRESS };
  return {
    completed_at: row.completed_at,
    revision_1_at: row.revision_1_at,
    revision_2_at: row.revision_2_at,
    test_1_at: row.test_1_at,
    test_2_at: row.test_2_at,
  };
}

function stageField(stage: TestProgressStage): "test_1_at" | "test_2_at" {
  return stage === "test_1" ? "test_1_at" : "test_2_at";
}

async function applicableChapter(userId: string, chapterId: string, db: HotD1Database) {
  const row = await db.prepare(`SELECT c.id,asm.subject_id
    FROM profiles p
    JOIN course_levels l ON l.code=p.ca_level
    JOIN chapters c ON c.id=?1
    JOIN attempt_syllabus_map asm
      ON asm.syllabus_version_id=c.syllabus_version_id
      AND asm.level_id=l.id
      AND asm.attempt_key=p.attempt_key
    JOIN course_groups g ON g.id=asm.group_id
    WHERE p.user_id=?2
      AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice)
    LIMIT 1`).bind(chapterId, userId).first<{ id: string; subject_id: string }>();
  if (!row) throw new Error("Chapter is not applicable to the current academic profile.");
  return row;
}

async function progressRow(userId: string, chapterId: string, db: HotD1Database) {
  return db.prepare(`SELECT completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,updated_at
    FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2 LIMIT 1`)
    .bind(userId, chapterId).first<ProgressRow>();
}

function assertPrerequisite(state: ProgressState, stage: TestProgressStage) {
  if (!state.completed_at) throw new Error("First Completion is required before saving a test attempt.");
  if (stage === "test_2" && !state.test_1_at) throw new Error("Test 2 requires Test 1 first.");
}

function assertChronology(state: ProgressState, stage: TestProgressStage, completedAt: string) {
  if (state.completed_at && Date.parse(completedAt) < Date.parse(state.completed_at)) throw new Error("A test cannot be completed before First Completion.");
  if (stage === "test_2" && state.test_1_at && Date.parse(completedAt) < Date.parse(state.test_1_at)) throw new Error("Test 2 cannot be completed before Test 1.");
}

function looksUnique(error: unknown) {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}

async function getAttemptByIdempotency(userId: string, idempotencyKey: string, db: HotD1Database) {
  return db.prepare(`SELECT a.id,a.subject_id,s.title AS subject_title,a.chapter_id,c.title AS chapter_title,c.chapter_number AS chapter_number,
      a.test_stage,a.attempt_number,a.marks_scored,a.marks_total,a.percentage,a.duration_minutes,a.completed_at,a.progress_event_id,a.created_at
    FROM test_attempts a JOIN chapters c ON c.id=a.chapter_id JOIN subjects s ON s.id=a.subject_id
    WHERE a.user_id=?1 AND a.idempotency_key=?2 LIMIT 1`).bind(userId, idempotencyKey).first<AttemptRow>();
}

async function getAttemptParts(userId: string, attemptIds: string[], db: HotD1Database) {
  if (!attemptIds.length) return { mistakes: [] as MistakeRow[], attachments: [] as AttachmentRow[] };
  const placeholders = attemptIds.map((_, index) => `?${index + 2}`).join(",");
  const [mistakeResult, attachmentResult] = await Promise.all([
    db.prepare(`SELECT id,attempt_id,category,note,created_at FROM test_attempt_mistakes WHERE user_id=?1 AND attempt_id IN (${placeholders}) ORDER BY created_at ASC`).bind(userId, ...attemptIds).all<MistakeRow>(),
    db.prepare(`SELECT id,attempt_id,attachment_kind,filename,mime_type,size_bytes,created_at FROM test_attempt_attachments WHERE user_id=?1 AND attempt_id IN (${placeholders}) ORDER BY created_at ASC`).bind(userId, ...attemptIds).all<AttachmentRow>(),
  ]);
  return { mistakes: mistakeResult.results ?? [], attachments: attachmentResult.results ?? [] };
}

function mistakeDto(row: MistakeRow): TestAttemptMistake {
  return { id: row.id, attemptId: row.attempt_id, category: row.category, note: row.note, createdAt: row.created_at };
}
function attachmentDto(row: AttachmentRow): TestAttemptAttachment {
  return { id: row.id, attemptId: row.attempt_id, kind: row.attachment_kind, filename: row.filename, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), createdAt: row.created_at };
}

function attemptsDto(rows: AttemptRow[], mistakes: MistakeRow[], attachments: AttachmentRow[]) {
  const mistakesByAttempt = new Map<string, TestAttemptMistake[]>();
  const attachmentsByAttempt = new Map<string, TestAttemptAttachment[]>();
  for (const row of mistakes) mistakesByAttempt.set(row.attempt_id, [...(mistakesByAttempt.get(row.attempt_id) ?? []), mistakeDto(row)]);
  for (const row of attachments) attachmentsByAttempt.set(row.attempt_id, [...(attachmentsByAttempt.get(row.attempt_id) ?? []), attachmentDto(row)]);
  const previousByKey = new Map<string, number>();
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((row) => {
    const key = `${row.chapter_id}:${row.test_stage}`;
    const previous = previousByKey.get(key);
    previousByKey.set(key, Number(row.percentage));
    return {
      id: row.id,
      subjectId: row.subject_id,
      subjectTitle: row.subject_title,
      chapterId: row.chapter_id,
      chapterTitle: row.chapter_title,
      chapterNumber: row.chapter_number,
      stage: row.test_stage,
      attemptNumber: Number(row.attempt_number),
      marksScored: Number(row.marks_scored),
      marksTotal: Number(row.marks_total),
      percentage: Number(row.percentage),
      durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
      completedAt: row.completed_at,
      improvementPoints: previous === undefined ? null : Math.round((Number(row.percentage) - previous) * 100) / 100,
      progressEventId: row.progress_event_id,
      createdAt: row.created_at,
      mistakes: mistakesByAttempt.get(row.id) ?? [],
      attachments: attachmentsByAttempt.get(row.id) ?? [],
    } satisfies TestAttempt;
  }).sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.attemptNumber - a.attemptNumber);
}

export async function getPhase5TestArchive(userId: string, chapterIds: string[], db: HotD1Database = getHotD1Database()): Promise<TestArchiveModel> {
  const ids = [...new Set(chapterIds.map((value) => value.trim()).filter(Boolean))].slice(0, 500);
  if (!ids.length) return { attempts: [], journal: [] };
  const placeholders = ids.map((_, index) => `?${index + 2}`).join(",");
  const result = await db.prepare(`SELECT a.id,a.subject_id,s.title AS subject_title,a.chapter_id,c.title AS chapter_title,c.chapter_number AS chapter_number,
      a.test_stage,a.attempt_number,a.marks_scored,a.marks_total,a.percentage,a.duration_minutes,a.completed_at,a.progress_event_id,a.created_at
    FROM test_attempts a JOIN chapters c ON c.id=a.chapter_id JOIN subjects s ON s.id=a.subject_id
    WHERE a.user_id=?1 AND a.chapter_id IN (${placeholders})
    ORDER BY a.completed_at DESC,a.attempt_number DESC`).bind(userId, ...ids).all<AttemptRow>();
  const rows = result.results ?? [];
  const parts = await getAttemptParts(userId, rows.map((row) => row.id), db);
  const attempts = attemptsDto(rows, parts.mistakes, parts.attachments);
  const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const journal: TestJournalEntry[] = parts.mistakes.map((row) => {
    const attempt = byId.get(row.attempt_id);
    if (!attempt) return null;
    return {
      ...mistakeDto(row),
      subjectId: attempt.subjectId,
      subjectTitle: attempt.subjectTitle,
      chapterId: attempt.chapterId,
      chapterTitle: attempt.chapterTitle,
      chapterNumber: attempt.chapterNumber,
      stage: attempt.stage,
      attemptNumber: attempt.attemptNumber,
      percentage: attempt.percentage,
      completedAt: attempt.completedAt,
    };
  }).filter((entry): entry is TestJournalEntry => Boolean(entry));
  return { attempts, journal };
}

export async function createPhase5TestAttempt(
  userId: string,
  input: { chapterId: unknown; stage: unknown; marksScored: unknown; marksTotal: unknown; durationMinutes: unknown; completedOn: unknown; mistakeCategories?: unknown; mistakeNote?: unknown; idempotencyKey: unknown },
  db: HotD1Database = getHotD1Database(),
): Promise<TestAttemptSaveResult> {
  const chapterId = cleanId(input.chapterId, "chapter");
  const stage = parseStage(input.stage);
  const marksScored = parseMarks(input.marksScored, "Marks scored");
  const marksTotal = parseMarks(input.marksTotal, "Total marks");
  if (marksTotal <= 0) throw new Error("Total marks must be greater than zero.");
  if (marksScored > marksTotal) throw new Error("Marks scored cannot exceed total marks.");
  const durationMinutes = parseDuration(input.durationMinutes);
  const completedAt = parseCompletedOn(input.completedOn);
  const idempotencyKey = cleanId(input.idempotencyKey, "retry key");
  const mistakeNote = parseNote(input.mistakeNote);
  const parsedMistakes = parseMistakes(input.mistakeCategories);
  const mistakeCategories: TestMistakeCategory[] = mistakeNote && parsedMistakes.length === 0 ? ["other"] : parsedMistakes;

  const prior = await getAttemptByIdempotency(userId, idempotencyKey, db);
  if (prior) {
    const parts = await getAttemptParts(userId, [prior.id], db);
    const state = stateFromRow(await progressRow(userId, prior.chapter_id, db));
    return { attempt: attemptsDto([prior], parts.mistakes, parts.attachments)[0], state, progressChanged: false, retry: true, eventId: prior.progress_event_id, savedAt: prior.created_at };
  }

  const chapter = await applicableChapter(userId, chapterId, db);
  await db.prepare("INSERT OR IGNORE INTO chapter_progress (user_id,chapter_id) VALUES (?1,?2)").bind(userId, chapterId).run();

  for (let allocationTry = 0; allocationTry < 4; allocationTry += 1) {
    const current = stateFromRow(await progressRow(userId, chapterId, db));
    assertPrerequisite(current, stage);
    assertChronology(current, stage, completedAt);
    const nextNumberRow = await db.prepare(`SELECT COALESCE(MAX(attempt_number),0)+1 AS next_number FROM test_attempts WHERE user_id=?1 AND chapter_id=?2 AND test_stage=?3`)
      .bind(userId, chapterId, stage).first<{ next_number: number }>();
    const attemptNumber = Number(nextNumberRow?.next_number ?? 1);
    const attemptId = crypto.randomUUID();
    const savedAt = new Date().toISOString();
    const percentage = Math.round((marksScored / marksTotal) * 10000) / 100;
    const field = stageField(stage);
    const progressChanged = !current[field];
    const eventId = progressChanged ? crypto.randomUUID() : null;
    const next: ProgressState = progressChanged ? { ...current, [field]: completedAt } : current;

    const statements = [
      db.prepare(`INSERT INTO test_attempts(id,user_id,subject_id,chapter_id,test_stage,attempt_number,marks_scored,marks_total,percentage,duration_minutes,completed_at,idempotency_key,progress_event_id,created_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`)
        .bind(attemptId, userId, chapter.subject_id, chapterId, stage, attemptNumber, marksScored, marksTotal, percentage, durationMinutes, completedAt, idempotencyKey, eventId, savedAt),
      ...mistakeCategories.map((category) => db.prepare(`INSERT INTO test_attempt_mistakes(id,attempt_id,user_id,category,note,created_at) VALUES (?1,?2,?3,?4,?5,?6)`)
        .bind(crypto.randomUUID(), attemptId, userId, category, mistakeNote, savedAt)),
    ];

    if (progressChanged) {
      statements.push(
        db.prepare(`UPDATE chapter_progress SET completed_at=?1,revision_1_at=?2,revision_2_at=?3,test_1_at=?4,test_2_at=?5,updated_at=?6 WHERE user_id=?7 AND chapter_id=?8`)
          .bind(next.completed_at, next.revision_1_at, next.revision_2_at, next.test_1_at, next.test_2_at, savedAt, userId, chapterId),
        db.prepare(`INSERT INTO progress_events(id,user_id,chapter_id,stage,action,previous_state,new_state) VALUES (?1,?2,?3,?4,'set',?5,?6)`)
          .bind(eventId, userId, chapterId, stage, JSON.stringify(current), JSON.stringify(next)),
        db.prepare(`INSERT INTO planner_events(id,user_id,event_type,entity_type,entity_id,payload,created_at) VALUES (?1,?2,'progress_changed','chapter_progress',?3,?4,?5)`)
          .bind(crypto.randomUUID(), userId, chapterId, JSON.stringify({ ...next, source: "test_attempt", testStage: stage, attemptId, attemptNumber }), savedAt),
      );
    }

    try {
      await db.batch(statements);
      const row = await getAttemptByIdempotency(userId, idempotencyKey, db);
      if (!row) throw new Error("Saved test attempt could not be reloaded.");
      const parts = await getAttemptParts(userId, [row.id], db);
      return { attempt: attemptsDto([row], parts.mistakes, parts.attachments)[0], state: next, progressChanged, retry: false, eventId, savedAt };
    } catch (error) {
      const committed = await getAttemptByIdempotency(userId, idempotencyKey, db);
      if (committed) {
        const parts = await getAttemptParts(userId, [committed.id], db);
        const state = stateFromRow(await progressRow(userId, committed.chapter_id, db));
        return { attempt: attemptsDto([committed], parts.mistakes, parts.attachments)[0], state, progressChanged: false, retry: true, eventId: committed.progress_event_id, savedAt: committed.created_at };
      }
      if (allocationTry < 3 && looksUnique(error)) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate the next attempt number. Retry the save.");
}

export async function getOwnedPhase5Attempt(userId: string, attemptIdValue: unknown, db: HotD1Database = getHotD1Database()) {
  const attemptId = cleanId(attemptIdValue, "attempt");
  return db.prepare("SELECT id,user_id,chapter_id,test_stage,attempt_number FROM test_attempts WHERE id=?1 AND user_id=?2 LIMIT 1")
    .bind(attemptId, userId).first<{ id: string; user_id: string; chapter_id: string; test_stage: TestProgressStage; attempt_number: number }>();
}

export async function getOwnedPhase5Attachment(userId: string, attachmentIdValue: unknown, db: HotD1Database = getHotD1Database()) {
  const attachmentId = cleanId(attachmentIdValue, "attachment");
  return db.prepare(`SELECT id,attempt_id,user_id,attachment_kind,object_key,filename,mime_type,size_bytes,created_at
    FROM test_attempt_attachments WHERE id=?1 AND user_id=?2 LIMIT 1`).bind(attachmentId, userId).first<AttachmentRow & { user_id: string; object_key: string }>();
}

export function parsePhase5AttachmentKind(value: unknown): TestAttachmentKind {
  if (typeof value !== "string" || !(TEST_ATTACHMENT_KINDS as readonly string[]).includes(value)) throw new Error("Choose a valid test attachment type.");
  return value as TestAttachmentKind;
}

export async function getPhase5TestAttachmentUsageBytes(userId: string, db: HotD1Database = getHotD1Database()) {
  const row = await db.prepare("SELECT COALESCE(SUM(size_bytes),0) AS total FROM test_attempt_attachments WHERE user_id=?1").bind(userId).first<{ total: number }>();
  return Number(row?.total ?? 0);
}
