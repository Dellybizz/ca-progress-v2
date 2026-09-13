import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import type { ProgressState } from "@/lib/progress/types";
import {
  TEST_PROGRESS_STAGES,
  type TestProgressStage,
  type TestStageRecord,
  type TestStageSaveResult,
  type TestStageUndoResult,
} from "./types";

type ProgressRow = ProgressState & { updated_at: string | null };
type TestStageRecordRow = {
  id: string;
  chapter_id: string;
  test_stage: TestProgressStage;
  marks_scored: number;
  marks_total: number;
  completed_at: string;
  progress_event_id: string | null;
  created_at: string;
  updated_at: string;
};
type ProgressEventRow = {
  id: string;
  stage: string;
  action: string;
  previous_state: string;
  new_state: string;
  undone_at: string | null;
};

const EMPTY_PROGRESS: ProgressState = {
  completed_at: null,
  revision_1_at: null,
  revision_2_at: null,
  test_1_at: null,
  test_2_at: null,
};

function cleanId(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean && clean.length <= 160 ? clean : null;
}

function stageField(stage: TestProgressStage): "test_1_at" | "test_2_at" {
  return stage === "test_1" ? "test_1_at" : "test_2_at";
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

function assertValidState(state: ProgressState) {
  if (state.revision_1_at && !state.completed_at) throw new Error("Revision 1 requires First Completion.");
  if (state.revision_2_at && !state.revision_1_at) throw new Error("Revision 2 requires Revision 1.");
  if (state.test_1_at && !state.completed_at) throw new Error("Test 1 requires First Completion.");
  if (state.test_2_at && !state.test_1_at) throw new Error("Test 2 requires Test 1.");
}

function parseStage(value: unknown): TestProgressStage {
  if (typeof value !== "string" || !(TEST_PROGRESS_STAGES as readonly string[]).includes(value)) {
    throw new Error("Choose Test 1 or Test 2.");
  }
  return value as TestProgressStage;
}

function parseMarks(value: unknown, label: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000) throw new Error(`${label} must be a valid number.`);
  return Math.round(number * 100) / 100;
}

function parseCompletedOn(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Choose a valid test completion date.");
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Choose a valid test completion date.");
  }
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  if (date >= tomorrow) throw new Error("A completed test cannot be dated in the future.");
  return date.toISOString();
}

function dto(row: TestStageRecordRow): TestStageRecord {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    stage: row.test_stage,
    marksScored: Number(row.marks_scored),
    marksTotal: Number(row.marks_total),
    completedAt: row.completed_at,
    progressEventId: row.progress_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertApplicableChapter(userId: string, chapterId: string, db: HotD1Database) {
  const row = await db.prepare(`SELECT c.id
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
    LIMIT 1`).bind(chapterId, userId).first<{ id: string }>();
  if (!row) throw new Error("Chapter is not applicable to the current academic profile.");
}

async function getProgressRow(userId: string, chapterId: string, db: HotD1Database) {
  return db.prepare(`SELECT completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,updated_at
    FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2 LIMIT 1`)
    .bind(userId, chapterId).first<ProgressRow>();
}

async function getRecord(userId: string, chapterId: string, stage: TestProgressStage, db: HotD1Database) {
  return db.prepare(`SELECT id,chapter_id,test_stage,marks_scored,marks_total,completed_at,progress_event_id,created_at,updated_at
    FROM test_stage_records WHERE user_id=?1 AND chapter_id=?2 AND test_stage=?3 LIMIT 1`)
    .bind(userId, chapterId, stage).first<TestStageRecordRow>();
}

function assertPrerequisite(state: ProgressState, stage: TestProgressStage) {
  if (!state.completed_at) throw new Error("First Completion is required before saving a test.");
  if (stage === "test_2" && !state.test_1_at) throw new Error("Test 2 requires Test 1 first.");
}

function assertChronology(state: ProgressState, stage: TestProgressStage, completedAt: string) {
  if (state.completed_at && Date.parse(completedAt) < Date.parse(state.completed_at)) {
    throw new Error("A test cannot be completed before First Completion.");
  }
  if (stage === "test_2" && state.test_1_at && Date.parse(completedAt) < Date.parse(state.test_1_at)) {
    throw new Error("Test 2 cannot be completed before Test 1.");
  }
}

function parseProgressState(value: string) {
  try {
    const parsed = JSON.parse(value) as ProgressState;
    assertValidState(parsed);
    return parsed;
  } catch {
    throw new Error("Progress history is invalid.");
  }
}

export async function getPhase4TestStageRecords(
  userId: string,
  chapterIds: string[],
  db: HotD1Database = getHotD1Database(),
) {
  const values = [...new Set(chapterIds.map((value) => cleanId(value)).filter((value): value is string => Boolean(value)))].slice(0, 500);
  if (!values.length) return [] as TestStageRecord[];
  const placeholders = values.map((_, index) => `?${index + 2}`).join(",");
  const rows = await db.prepare(`SELECT id,chapter_id,test_stage,marks_scored,marks_total,completed_at,progress_event_id,created_at,updated_at
    FROM test_stage_records
    WHERE user_id=?1 AND chapter_id IN (${placeholders})
    ORDER BY completed_at DESC, test_stage DESC`)
    .bind(userId, ...values).all<TestStageRecordRow>();
  return (rows.results ?? []).map(dto);
}

export async function savePhase4TestStage(
  userId: string,
  input: { chapterId: unknown; stage: unknown; marksScored: unknown; marksTotal: unknown; completedOn: unknown },
  db: HotD1Database = getHotD1Database(),
): Promise<TestStageSaveResult> {
  const chapterId = cleanId(input.chapterId);
  if (!chapterId) throw new Error("Choose a valid chapter.");
  const stage = parseStage(input.stage);
  const marksScored = parseMarks(input.marksScored, "Marks scored");
  const marksTotal = parseMarks(input.marksTotal, "Total marks");
  if (marksTotal <= 0) throw new Error("Total marks must be greater than zero.");
  if (marksScored > marksTotal) throw new Error("Marks scored cannot exceed total marks.");
  const requestedCompletedAt = parseCompletedOn(input.completedOn);

  await assertApplicableChapter(userId, chapterId, db);
  await db.prepare("INSERT OR IGNORE INTO chapter_progress (user_id,chapter_id) VALUES (?1,?2)").bind(userId, chapterId).run();

  const progressRow = await getProgressRow(userId, chapterId, db);
  const state = stateFromRow(progressRow);
  assertPrerequisite(state, stage);
  const existing = await getRecord(userId, chapterId, stage, db);
  const completedAt = existing?.completed_at ?? requestedCompletedAt;
  assertChronology(state, stage, completedAt);

  const field = stageField(stage);
  const savedAt = new Date().toISOString();

  if (existing && state[field]) {
    await db.prepare(`UPDATE test_stage_records
      SET marks_scored=?1,marks_total=?2,updated_at=?3
      WHERE id=?4 AND user_id=?5`)
      .bind(marksScored, marksTotal, savedAt, existing.id, userId).run();
    const updated = await getRecord(userId, chapterId, stage, db);
    if (!updated) throw new Error("Saved test record could not be reloaded.");
    return { record: dto(updated), state, progressChanged: false, eventId: null, savedAt };
  }

  if (!existing && state[field]) {
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO test_stage_records
      (id,user_id,chapter_id,test_stage,marks_scored,marks_total,completed_at,progress_event_id,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8,?8)`)
      .bind(id, userId, chapterId, stage, marksScored, marksTotal, completedAt, savedAt).run();
    const record = await getRecord(userId, chapterId, stage, db);
    if (!record) throw new Error("Saved test record could not be reloaded.");
    return { record: dto(record), state, progressChanged: false, eventId: null, savedAt };
  }

  const previous = state;
  const next: ProgressState = { ...previous, [field]: completedAt };
  assertValidState(next);
  const eventId = crypto.randomUUID();
  const recordId = existing?.id ?? crypto.randomUUID();

  const statements = [
    existing
      ? db.prepare(`UPDATE test_stage_records SET marks_scored=?1,marks_total=?2,progress_event_id=?3,updated_at=?4
          WHERE id=?5 AND user_id=?6`).bind(marksScored, marksTotal, eventId, savedAt, recordId, userId)
      : db.prepare(`INSERT INTO test_stage_records
          (id,user_id,chapter_id,test_stage,marks_scored,marks_total,completed_at,progress_event_id,created_at,updated_at)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)`)
        .bind(recordId, userId, chapterId, stage, marksScored, marksTotal, completedAt, eventId, savedAt),
    db.prepare(`UPDATE chapter_progress
      SET completed_at=?1,revision_1_at=?2,revision_2_at=?3,test_1_at=?4,test_2_at=?5,updated_at=?6
      WHERE user_id=?7 AND chapter_id=?8`)
      .bind(next.completed_at, next.revision_1_at, next.revision_2_at, next.test_1_at, next.test_2_at, savedAt, userId, chapterId),
    db.prepare(`INSERT INTO progress_events
      (id,user_id,chapter_id,stage,action,previous_state,new_state)
      VALUES (?1,?2,?3,?4,'set',?5,?6)`)
      .bind(eventId, userId, chapterId, stage, JSON.stringify(previous), JSON.stringify(next)),
    db.prepare(`INSERT INTO planner_events
      (id,user_id,event_type,entity_type,entity_id,payload,created_at)
      VALUES (?1,?2,'progress_changed','chapter_progress',?3,?4,?5)`)
      .bind(crypto.randomUUID(), userId, chapterId, JSON.stringify({
        ...next,
        source: "test_stage_record",
        testStage: stage,
        recordId,
      }), savedAt),
  ];
  await db.batch(statements);

  const record = await getRecord(userId, chapterId, stage, db);
  if (!record) throw new Error("Saved test record could not be reloaded.");
  return { record: dto(record), state: next, progressChanged: true, eventId, savedAt };
}

export async function undoPhase4TestStage(
  userId: string,
  recordIdValue: unknown,
  db: HotD1Database = getHotD1Database(),
): Promise<TestStageUndoResult> {
  const recordId = cleanId(recordIdValue);
  if (!recordId) throw new Error("Choose a valid saved test record.");
  const record = await db.prepare(`SELECT id,chapter_id,test_stage,marks_scored,marks_total,completed_at,progress_event_id,created_at,updated_at
    FROM test_stage_records WHERE id=?1 AND user_id=?2 LIMIT 1`)
    .bind(recordId, userId).first<TestStageRecordRow>();
  if (!record) throw new Error("Saved test record not found.");

  const progressRow = await getProgressRow(userId, record.chapter_id, db);
  const current = stateFromRow(progressRow);
  if (record.test_stage === "test_1" && current.test_2_at) throw new Error("Undo Test 2 before removing Test 1.");

  const savedAt = new Date().toISOString();
  if (!record.progress_event_id) {
    await db.prepare("DELETE FROM test_stage_records WHERE id=?1 AND user_id=?2").bind(record.id, userId).run();
    return {
      recordId: record.id,
      chapterId: record.chapter_id,
      state: current,
      progressChanged: false,
      eventId: null,
      savedAt,
    };
  }

  const event = await db.prepare(`SELECT id,stage,action,previous_state,new_state,undone_at
    FROM progress_events WHERE id=?1 AND user_id=?2 LIMIT 1`)
    .bind(record.progress_event_id, userId).first<ProgressEventRow>();
  if (!event || event.action !== "set" || event.undone_at) throw new Error("This test progress change cannot be recovered safely.");

  const previous = parseProgressState(event.previous_state);
  const recorded = parseProgressState(event.new_state);
  if (JSON.stringify(current) !== JSON.stringify(recorded)) {
    throw new Error("Progress changed after this test; undo would overwrite a newer change.");
  }
  const undoId = crypto.randomUUID();

  await db.batch([
    db.prepare("DELETE FROM test_stage_records WHERE id=?1 AND user_id=?2").bind(record.id, userId),
    db.prepare(`UPDATE chapter_progress
      SET completed_at=?1,revision_1_at=?2,revision_2_at=?3,test_1_at=?4,test_2_at=?5,updated_at=?6
      WHERE user_id=?7 AND chapter_id=?8`)
      .bind(previous.completed_at, previous.revision_1_at, previous.revision_2_at, previous.test_1_at, previous.test_2_at, savedAt, userId, record.chapter_id),
    db.prepare(`INSERT INTO progress_events
      (id,user_id,chapter_id,stage,action,previous_state,new_state,reverts_event_id)
      VALUES (?1,?2,?3,?4,'undo',?5,?6,?7)`)
      .bind(undoId, userId, record.chapter_id, record.test_stage, JSON.stringify(current), JSON.stringify(previous), event.id),
    db.prepare("UPDATE progress_events SET undone_at=?1 WHERE id=?2 AND user_id=?3").bind(savedAt, event.id, userId),
    db.prepare(`INSERT INTO planner_events
      (id,user_id,event_type,entity_type,entity_id,payload,created_at)
      VALUES (?1,?2,'progress_changed','chapter_progress',?3,?4,?5)`)
      .bind(crypto.randomUUID(), userId, record.chapter_id, JSON.stringify({
        ...previous,
        source: "test_stage_recovery",
        testStage: record.test_stage,
        revertedEventId: event.id,
      }), savedAt),
  ]);

  return {
    recordId: record.id,
    chapterId: record.chapter_id,
    state: previous,
    progressChanged: true,
    eventId: undoId,
    savedAt,
  };
}
