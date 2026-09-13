import { offlineTransaction } from "@/lib/offline/transaction-context";
import "server-only";

import { createHotCommunityMessage } from "@/lib/data/d1/hot-screens";
import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";

export type StudyFocusRating = "poor" | "okay" | "focused";

const MAX_SESSION_SECONDS = 12 * 60 * 60;
const STALE_INTERACTION_MS = 16 * 60 * 60 * 1000;
export const MEANINGFUL_REFLECTION_SECONDS = 60;

type TimerRow = {
  user_id: string;
  subject_id: string | null;
  chapter_id: string | null;
  status: string;
  mode: string;
  timezone: string;
  started_at: string;
  running_since: string | null;
  paused_at: string | null;
  elapsed_seconds: number;
  focus_target_seconds: number | null;
  break_target_seconds: number | null;
  last_interaction_at: string;
};

type TimerPhase3Row = {
  task_id: string | null;
  plan_item_id: string | null;
  pause_count: number;
  paused_seconds: number;
};

type LinkedWork = {
  subject_id: string | null;
  chapter_id: string | null;
  title: string;
};

type SessionForReflection = {
  id: string;
  subject_id: string | null;
  chapter_id: string | null;
  duration_seconds: number;
  ended_at: string;
  task_id: string | null;
  plan_item_id: string | null;
  intended_task_title: string | null;
};

function cleanId(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean && clean.length <= 160 ? clean : null;
}

function safeText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function safeTimeZone(value: unknown) {
  const timezone = typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new Error("Choose a valid timezone.");
  }
}

function asInteger(value: unknown, fallback: number | null = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function timerElapsed(row: TimerRow, now: Date) {
  const running = row.status === "running" && row.running_since
    ? Math.max(0, Math.floor((now.valueOf() - Date.parse(row.running_since)) / 1000))
    : 0;
  return Math.max(0, Number(row.elapsed_seconds ?? 0) + running);
}

function pausedSince(row: TimerRow, now: Date) {
  if (row.status !== "paused" || !row.paused_at) return 0;
  return Math.max(0, Math.floor((now.valueOf() - Date.parse(row.paused_at)) / 1000));
}

function assertTimerFresh(row: TimerRow, now: Date) {
  if (timerElapsed(row, now) > MAX_SESSION_SECONDS) throw new Error("This timer is longer than the 12-hour safety limit. Discard it and start a fresh session.");
  if (now.valueOf() - Date.parse(row.last_interaction_at) > STALE_INTERACTION_MS) throw new Error("This timer is stale. Discard it and start a fresh session so inactive time is not saved.");
}

async function assertAcademicSelection(userId: string, subjectId: string | null, chapterId: string | null, db: HotD1Database) {
  if (subjectId) {
    const valid = await db.prepare(`SELECT 1 AS ok FROM profiles p
      JOIN course_levels l ON l.code=p.ca_level
      JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key AND asm.subject_id=?1
      JOIN course_groups g ON g.id=asm.group_id
      WHERE p.user_id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice)
      LIMIT 1`).bind(subjectId, userId).first<{ ok: number }>();
    if (!valid) throw new Error("Selected subject is not applicable to your current profile.");
  }
  if (chapterId) {
    const valid = await db.prepare(`SELECT c.id,sv.subject_id FROM profiles p
      JOIN course_levels l ON l.code=p.ca_level
      JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
      JOIN chapters c ON c.syllabus_version_id=asm.syllabus_version_id
      JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id
      WHERE p.user_id=?1 AND c.id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR asm.group_id IN (SELECT id FROM course_groups WHERE code=p.group_choice))
      LIMIT 1`).bind(userId, chapterId).first<{ id: string; subject_id: string }>();
    if (!valid || (subjectId && valid.subject_id !== subjectId)) throw new Error("Selected chapter is not applicable to your current profile.");
  }
}

async function linkedWork(userId: string, taskId: string | null, planItemId: string | null, db: HotD1Database) {
  if (taskId && planItemId) throw new Error("A study session can link to one intended task source at a time.");
  if (taskId) {
    const row = await db.prepare(`SELECT subject_id,chapter_id,title FROM tasks WHERE id=?1 AND user_id=?2 AND status<>'cancelled' LIMIT 1`).bind(taskId, userId).first<LinkedWork>();
    if (!row) throw new Error("The selected planner task is unavailable.");
    return row;
  }
  if (planItemId) {
    const row = await db.prepare(`SELECT subject_id,chapter_id,title FROM daily_plan_items WHERE id=?1 AND user_id=?2 AND status IN ('planned','completed') LIMIT 1`).bind(planItemId, userId).first<LinkedWork>();
    if (!row) throw new Error("The selected Today item is unavailable.");
    return row;
  }
  return null;
}

async function activeTimer(userId: string, db: HotD1Database) {
  return db.prepare(`SELECT user_id,subject_id,chapter_id,status,mode,timezone,started_at,running_since,paused_at,elapsed_seconds,focus_target_seconds,break_target_seconds,last_interaction_at FROM study_timer_state WHERE user_id=?1 LIMIT 1`).bind(userId).first<TimerRow>();
}

async function activeTimerPhase3(userId: string, db: HotD1Database) {
  return db.prepare(`SELECT task_id,plan_item_id,pause_count,paused_seconds FROM study_timer_phase3 WHERE user_id=?1 LIMIT 1`).bind(userId).first<TimerPhase3Row>();
}

export async function performStudyTimerAction(userId: string, body: Record<string, unknown>, db: HotD1Database = getHotD1Database()) {
  const action = safeText(body.action, 24);
  const occurredAt = offlineTransaction.getStore() && typeof body.offlineOccurredAt === "string" ? Date.parse(body.offlineOccurredAt) : Date.now();
  if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 60_000 || occurredAt < Date.now() - 7 * 86400_000) throw new Error("Offline session time needs review (outside the seven-day window).");
  const now = new Date(occurredAt);
  const nowIso = now.toISOString();

  if (action === "start") {
    const existing = await activeTimer(userId, db);
    if (existing) {
      assertTimerFresh(existing, now);
      throw new Error("A study timer is already active. Finish or discard it before starting another session.");
    }

    const mode = safeText(body.mode, 20) || "stopwatch";
    if (!['stopwatch', 'pomodoro'].includes(mode)) throw new Error("Unsupported study timer mode.");
    const timezone = safeTimeZone(body.timezone);
    const taskId = cleanId(body.taskId);
    const planItemId = cleanId(body.planItemId);
    const work = await linkedWork(userId, taskId, planItemId, db);
    let subjectId = cleanId(body.subjectId);
    let chapterId = cleanId(body.chapterId);
    if (work) {
      if (subjectId && work.subject_id && subjectId !== work.subject_id) throw new Error("The selected task belongs to another subject.");
      if (chapterId && work.chapter_id && chapterId !== work.chapter_id) throw new Error("The selected task belongs to another chapter.");
      subjectId = subjectId ?? work.subject_id;
      chapterId = chapterId ?? work.chapter_id;
    }
    if (!chapterId && !work) throw new Error("Choose a chapter before starting a standalone study session.");
    await assertAcademicSelection(userId, subjectId, chapterId, db);

    const focusMinutes = asInteger(body.focusMinutes);
    const breakMinutes = asInteger(body.breakMinutes, 0);
    if (mode === "pomodoro" && (!Number.isInteger(focusMinutes) || Number(focusMinutes) < 1 || Number(focusMinutes) > 720)) throw new Error("Focus minutes must be between 1 and 720.");
    if (mode === "pomodoro" && (!Number.isInteger(breakMinutes) || Number(breakMinutes) < 0 || Number(breakMinutes) > 120)) throw new Error("Break minutes must be between 0 and 120.");
    const focusSeconds = mode === "pomodoro" ? Number(focusMinutes) * 60 : null;
    const breakSeconds = mode === "pomodoro" ? Number(breakMinutes) * 60 : null;

    try {
      await db.batch([
        db.prepare(`INSERT INTO study_timer_state (user_id,subject_id,chapter_id,status,mode,timezone,started_at,running_since,paused_at,elapsed_seconds,focus_target_seconds,break_target_seconds,last_interaction_at,updated_at)
          VALUES (?1,?2,?3,'running',?4,?5,?6,?6,NULL,0,?7,?8,?6,CURRENT_TIMESTAMP)`).bind(userId, subjectId, chapterId, mode, timezone, nowIso, focusSeconds, breakSeconds),
        db.prepare(`INSERT INTO study_timer_phase3 (user_id,task_id,plan_item_id,pause_count,paused_seconds) VALUES (?1,?2,?3,0,0)`).bind(userId, taskId, planItemId),
        db.prepare(`INSERT INTO planner_events (id,user_id,event_type,entity_type,entity_id,payload) VALUES (?1,?2,'study_timer_started','study_timer',?2,?3)`).bind(crypto.randomUUID(), userId, JSON.stringify({ subjectId, chapterId, taskId, planItemId, mode })),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Study timer could not be started.";
      if (/unique|constraint|primary key/i.test(message)) throw new Error("A study timer is already active. Finish or discard it before starting another session.");
      throw error;
    }
    return { status: "running", started_at: nowIso, running_since: nowIso, elapsed_seconds: 0 };
  }

  const timer = await activeTimer(userId, db);
  const replayId=cleanId(body.clientId);
  if(!timer&&action==="finish"&&replayId){const replay=await db.prepare("SELECT id,ended_at,duration_seconds FROM study_sessions WHERE id=?1 AND user_id=?2 LIMIT 1").bind(replayId,userId).first<{id:string;ended_at:string;duration_seconds:number}>();if(replay)return{session_id:replay.id,ended_at:replay.ended_at,duration_seconds:replay.duration_seconds};}
  if (!timer) throw new Error("No active study timer was found.");
  if (now.getTime() < Date.parse(timer.last_interaction_at)) throw new Error("Offline timer actions are out of order.");
  const extension = await activeTimerPhase3(userId, db) ?? { task_id: null, plan_item_id: null, pause_count: 0, paused_seconds: 0 };

  const attachedPlanItem = offlineTransaction.getStore()?.timerPlanItemId;
  if (attachedPlanItem) extension.plan_item_id = attachedPlanItem;

  if (action === "touch") {
    if (timer.status === "running") await db.prepare(`UPDATE study_timer_state SET last_interaction_at=?1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?2`).bind(nowIso, userId).run();
    return { status: timer.status, saved_at: nowIso };
  }

  if (action === "discard") {
    await db.batch([
      db.prepare(`DELETE FROM study_timer_state WHERE user_id=?1`).bind(userId),
      db.prepare(`INSERT INTO planner_events (id,user_id,event_type,entity_type,entity_id,payload) VALUES (?1,?2,'study_timer_discarded','study_timer',?2,?3)`).bind(crypto.randomUUID(), userId, JSON.stringify({ startedAt: timer.started_at, taskId: extension.task_id, planItemId: extension.plan_item_id })),
    ]);
    return { discarded: true };
  }

  assertTimerFresh(timer, now);

  if (action === "pause") {
    if (timer.status !== "running") throw new Error("Only a running timer can be paused.");
    const elapsed = timerElapsed(timer, now);
    await db.batch([
      db.prepare(`UPDATE study_timer_state SET status='paused',elapsed_seconds=?1,running_since=NULL,paused_at=?2,last_interaction_at=?2,updated_at=CURRENT_TIMESTAMP WHERE user_id=?3`).bind(elapsed, nowIso, userId),
      db.prepare(`UPDATE study_timer_phase3 SET pause_count=pause_count+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?1`).bind(userId),
    ]);
    return { status: "paused", elapsed_seconds: elapsed, paused_at: nowIso };
  }

  if (action === "resume") {
    if (timer.status !== "paused") throw new Error("Only a paused timer can be resumed.");
    const pausedSeconds = pausedSince(timer, now);
    await db.batch([
      db.prepare(`UPDATE study_timer_state SET status='running',running_since=?1,paused_at=NULL,last_interaction_at=?1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?2`).bind(nowIso, userId),
      db.prepare(`UPDATE study_timer_phase3 SET paused_seconds=paused_seconds+?1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?2`).bind(pausedSeconds, userId),
    ]);
    return { status: "running", running_since: nowIso, elapsed_seconds: timer.elapsed_seconds };
  }

  if (action === "finish") {
    const elapsed = timerElapsed(timer, now);
    if (elapsed < 1) throw new Error("Study at least one second before finishing a session.");
    if (elapsed > MAX_SESSION_SECONDS) throw new Error("This timer is longer than the 12-hour safety limit. Discard it instead of saving inactive time.");
    const finalPausedSeconds = extension.paused_seconds + pausedSince(timer, now);
    const sessionId = replayId ?? crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO study_sessions (id,user_id,subject_id,chapter_id,mode,timezone,started_at,ended_at,duration_seconds,focus_target_seconds,break_target_seconds)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`).bind(sessionId, userId, timer.subject_id, timer.chapter_id, timer.mode, timer.timezone, timer.started_at, nowIso, elapsed, timer.focus_target_seconds, timer.break_target_seconds),
      db.prepare(`INSERT INTO study_session_phase3 (session_id,user_id,task_id,plan_item_id,pause_count,paused_seconds,completion_state)
        VALUES (?1,?2,?3,?4,?5,?6,'completed')`).bind(sessionId, userId, extension.task_id, extension.plan_item_id, extension.pause_count, finalPausedSeconds),
      db.prepare(`DELETE FROM study_timer_state WHERE user_id=?1`).bind(userId),
      db.prepare(`INSERT INTO planner_events (id,user_id,event_type,entity_type,entity_id,payload) VALUES (?1,?2,'study_session_finished','study_session',?3,?4)`).bind(crypto.randomUUID(), userId, sessionId, JSON.stringify({ durationSeconds: elapsed, subjectId: timer.subject_id, chapterId: timer.chapter_id, taskId: extension.task_id, planItemId: extension.plan_item_id, pauseCount: extension.pause_count, pausedSeconds: finalPausedSeconds })),
    ]);
    return {
      session_id: sessionId,
      duration_seconds: elapsed,
      ended_at: nowIso,
      reflection_required: elapsed >= MEANINGFUL_REFLECTION_SECONDS,
    };
  }

  throw new Error("Unsupported study timer action.");
}

export async function getPendingStudyReflection(userId: string, preferredSessionId?: string | null, db: HotD1Database = getHotD1Database()) {
  const preferred = cleanId(preferredSessionId);
  const preferenceSql = preferred ? "AND s.id=?2" : "";
  const statement = db.prepare(`SELECT s.id,s.subject_id,s.chapter_id,s.duration_seconds,s.ended_at,x.task_id,x.plan_item_id,
      COALESCE(t.title,dpi.title) AS intended_task_title
    FROM study_sessions s
    JOIN study_session_phase3 x ON x.session_id=s.id AND x.user_id=s.user_id
    LEFT JOIN tasks t ON t.id=x.task_id AND t.user_id=s.user_id
    LEFT JOIN daily_plan_items dpi ON dpi.id=x.plan_item_id AND dpi.user_id=s.user_id
    WHERE s.user_id=?1 ${preferenceSql} AND s.duration_seconds>=${MEANINGFUL_REFLECTION_SECONDS} AND x.reflection_saved_at IS NULL
    ORDER BY s.ended_at DESC LIMIT 1`);
  return (preferred ? statement.bind(userId, preferred) : statement.bind(userId)).first<SessionForReflection>();
}

export async function saveStudySessionReflection(
  userId: string,
  sessionId: string,
  input: { understandingScore: unknown; focusRating: unknown; doubtBody?: unknown; doubtVisibility?: unknown },
  db: HotD1Database = getHotD1Database(),
) {
  const cleanSessionId = cleanId(sessionId);
  if (!cleanSessionId) throw new Error("A valid study session is required.");
  const understandingScore = asInteger(input.understandingScore);
  if (!Number.isInteger(understandingScore) || Number(understandingScore) < 0 || Number(understandingScore) > 100) throw new Error("Self-reported understanding must be between 0 and 100.");
  const focusRating = safeText(input.focusRating, 20) as StudyFocusRating;
  if (!(["poor", "okay", "focused"] as const).includes(focusRating)) throw new Error("Choose Poor, Okay or Focused for focus.");
  const doubtBody = safeText(input.doubtBody, 1200);
  const doubtVisibility = doubtBody ? safeText(input.doubtVisibility, 20) : "";
  if (doubtBody && !["private", "community"].includes(doubtVisibility)) throw new Error("Choose whether to keep the doubt private or send it to Community.");

  const session = await db.prepare(`SELECT s.id,s.subject_id,s.chapter_id,s.duration_seconds,s.ended_at,x.reflection_saved_at
    FROM study_sessions s JOIN study_session_phase3 x ON x.session_id=s.id AND x.user_id=s.user_id
    WHERE s.id=?1 AND s.user_id=?2 LIMIT 1`).bind(cleanSessionId, userId).first<{ id: string; subject_id: string | null; chapter_id: string | null; duration_seconds: number; ended_at: string; reflection_saved_at: string | null }>();
  if (!session) throw new Error("Study session not found or not owned by this account.");
  if (session.duration_seconds < MEANINGFUL_REFLECTION_SECONDS) throw new Error("Reflection is available after a meaningful completed session.");
  if (session.reflection_saved_at) throw new Error("This study-session reflection has already been saved.");

  const nowIso = new Date().toISOString();
  let doubt: { id: string; visibility: string; communityPath?: string } | null = null;

  if (doubtBody && doubtVisibility === "community") {
    if (!session.subject_id || !session.chapter_id) throw new Error("A Community doubt needs chapter context. Keep this doubt private or study from a chapter-linked session.");
    await assertAcademicSelection(userId, session.subject_id, session.chapter_id, db);
    const channel = await db.prepare(`SELECT id,slug FROM community_channels WHERE subject_id=?1 AND scope_type='subject' AND is_active=1 ORDER BY sort_order LIMIT 1`).bind(session.subject_id).first<{ id: string; slug: string }>();
    if (!channel) throw new Error("No subject-specific Community doubts room is currently available. Keep this doubt private instead.");
    const profile = await db.prepare(`SELECT display_name FROM profiles WHERE user_id=?1 LIMIT 1`).bind(userId).first<{ display_name: string | null }>();
    const message = await createHotCommunityMessage({ channelSlug: channel.slug, userId, authorLabel: profile?.display_name?.trim() || "Student", body: doubtBody }, db);
    const doubtId = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO study_session_doubts (id,session_id,user_id,subject_id,chapter_id,visibility,body,status,community_channel_id,community_message_id)
        VALUES (?1,?2,?3,?4,?5,'community',?6,'open',?7,?8)`).bind(doubtId, cleanSessionId, userId, session.subject_id, session.chapter_id, doubtBody, channel.id, message.id),
      db.prepare(`UPDATE study_session_phase3 SET understanding_score=?1,focus_rating=?2,reflection_saved_at=?3,updated_at=CURRENT_TIMESTAMP WHERE session_id=?4 AND user_id=?5 AND reflection_saved_at IS NULL`).bind(understandingScore, focusRating, nowIso, cleanSessionId, userId),
    ]);
    doubt = { id: doubtId, visibility: "community", communityPath: `/community/${channel.slug}?chapterId=${encodeURIComponent(session.chapter_id)}` };
  } else {
    const statements = [
      db.prepare(`UPDATE study_session_phase3 SET understanding_score=?1,focus_rating=?2,reflection_saved_at=?3,updated_at=CURRENT_TIMESTAMP WHERE session_id=?4 AND user_id=?5 AND reflection_saved_at IS NULL`).bind(understandingScore, focusRating, nowIso, cleanSessionId, userId),
    ];
    if (doubtBody) {
      const doubtId = crypto.randomUUID();
      statements.push(db.prepare(`INSERT INTO study_session_doubts (id,session_id,user_id,subject_id,chapter_id,visibility,body,status)
        VALUES (?1,?2,?3,?4,?5,'private',?6,'open')`).bind(doubtId, cleanSessionId, userId, session.subject_id, session.chapter_id, doubtBody));
      doubt = { id: doubtId, visibility: "private" };
    }
    await db.batch(statements);
  }

  return { ok: true, sessionId: cleanSessionId, reflectionSavedAt: nowIso, doubt };
}
