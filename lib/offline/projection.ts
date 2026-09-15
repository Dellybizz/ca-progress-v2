import type { ProgressReadyModel } from "@/lib/progress/types";
import type { PlannerReadyModel } from "@/lib/planner/types";
import type { ResourceLibraryReady, NoteCard } from "@/lib/resources/types";
import type { StudyReadyModel, StudyTimerSnapshot } from "@/lib/study/types";
export type EditBody = Record<string, unknown>;
export const snapshotKind = (url: string) => ({ "/api/progress": "progress", "/api/planner/tasks": "planner", "/api/notes": "notes", "/api/study/timer": "study" })[url];
export const entityKey = (url: string, body: EditBody) => `${url}:${url === "/api/progress" ? body.chapterId : url === "/api/study/timer" ? "timer" : body.id || body.clientId}`;

export function conflictBaseline(url: string, body: EditBody, data: unknown): Record<string, unknown> | null {
  if (url === "/api/progress") {
    const row = (data as ProgressReadyModel | null)?.chapters?.find(c => c.id === body.chapterId);
    if (!row) throw new Error("Open this chapter online before editing offline.");
    return { ...row.state };
  }
  if (url === "/api/planner/tasks") {
    if (body.action === "create") return null;
    const row = (data as PlannerReadyModel | null)?.tasks?.find(c => c.id === body.id);
    if (!row) throw new Error("Open this task online before editing offline.");
    return { title: row.title, notes: row.notes, status: row.status, subject_id: row.subjectId, chapter_id: row.chapterId, due_at: row.dueAt, estimated_minutes: row.estimatedMinutes };
  }
  if (url === "/api/notes") {
    if (!body.id) return null;
    const row = (data as ResourceLibraryReady | null)?.myNotes?.find(c => c.id === body.id);
    if (!row) throw new Error("Open your notes online before editing offline.");
    return { title: row.title, body_html: row.bodyHtml, subject_id: row.subjectId, chapter_id: row.chapterId, visibility: row.visibility, updated_at: row.updatedAt };
  }
  const row = (data as StudyReadyModel | null)?.timer;
  return row ? { status: row.status, started_at: row.startedAt, elapsed_seconds: row.storedElapsedSeconds ?? row.elapsedSeconds, running_since: row.runningSince, paused_at: row.pausedAt } : null;
}

export function projectOfflineEdit<T>(kind: string, input: T, url: string, body: EditBody, result?: Record<string, unknown>): T {
  if (!input || typeof input !== "object" || !("mode" in input) || input.mode !== "ready") return input;
  const at = String(body.offlineOccurredAt);
  if (kind === "progress" && url === "/api/progress") {
    const model = structuredClone(input) as unknown as ProgressReadyModel;
    const row = model.chapters.find(c => c.id === body.chapterId);
    if (row) { row.state = result?.state as typeof row.state ?? { ...row.state, [`${body.stage}_at`]: body.enabled ? at : null }; row.updatedAt = String(result?.saved_at ?? at); }
    return model as T;
  }
  if (kind === "planner" && url === "/api/planner/tasks") {
    const model = structuredClone(input) as unknown as PlannerReadyModel;
    const id = String(body.id || body.clientId);
    if (body.action === "delete") model.tasks = model.tasks.filter(t => t.id !== id);
    else if (body.action === "toggle") model.tasks = model.tasks.map(t => t.id === id ? { ...t, status: body.done ? "done" : "todo", completedAt: body.done ? at : null } : t);
    else {
      const old = model.tasks.find(t => t.id === id);
      const task = { id, title: String(body.title), notes: body.notes ? String(body.notes) : null, taskKind: body.taskKind ?? "study", subjectId: body.subjectId ?? null, chapterId: body.chapterId ?? null, dueAt: String(body.dueAt), scheduleMode: body.scheduleMode ?? "fixed", targetDate: body.targetDate ?? null, estimatedMinutes: Number(body.estimatedMinutes ?? 30), status: old?.status ?? "todo", completedAt: old?.completedAt ?? null, subjectTitle: old?.subjectTitle ?? null, chapterTitle: old?.chapterTitle ?? null } as PlannerReadyModel["tasks"][number];
      model.tasks = [task, ...model.tasks.filter(t => t.id !== id)];
    }
    return model as T;
  }
  if ((kind === "notes" || kind === "resources") && url === "/api/notes") {
    const model = structuredClone(input) as unknown as ResourceLibraryReady;
    const id = String(body.id || body.clientId);
    const old = model.myNotes.find(n => n.id === id);
    const note = { ...old, id, title: String(body.title), bodyHtml: String((result?._offlineBaseline as Record<string, unknown> | undefined)?.body_html ?? body.bodyHtml), excerpt: String(body.bodyHtml).replace(/<[^>]*>/g, " ").slice(0, 180), subjectId: body.subjectId || null, chapterId: body.chapterId || null, topicId: body.topicId || null, subjectTitle: old?.subjectTitle ?? null, chapterTitle: old?.chapterTitle ?? null, topicTitle: old?.topicTitle ?? null, tags: body.tags ?? [], resourceIds: body.resourceIds ?? [], source: old?.source ?? null, visibility: body.visibility ?? "private", moderationStatus: body.visibility === "shared" ? "pending" : "private", ownerLabel: model.viewerName, isOwner: true, updatedAt: String((result?._offlineBaseline as Record<string, unknown> | undefined)?.updated_at ?? at), publishedAt: null } as NoteCard;
    model.myNotes = [note, ...model.myNotes.filter(n => n.id !== id)];
    return model as T;
  }
  if (kind === "study" && url === "/api/study/timer") {
    const model = structuredClone(input) as unknown as StudyReadyModel;
    if (body.action === "start") {
      const subject = model.subjects.find(s => s.id === body.subjectId);
      const chapter = subject?.chapters.find(c => c.id === body.chapterId);
      model.timer = { status: "running", mode: body.mode, subjectId: body.subjectId || null, chapterId: body.chapterId || null, taskId: body.taskId || null, planItemId: body.planItemId || null, subjectTitle: subject?.title ?? null, chapterTitle: chapter?.title ?? null, intendedTaskTitle: null, pauseCount: 0, pausedSeconds: 0, focusTargetSeconds: body.mode === "pomodoro" ? Number(body.focusMinutes) * 60 : null, breakTargetSeconds: body.mode === "pomodoro" ? Number(body.breakMinutes) * 60 : null, startedAt: at, runningSince: at, elapsedSeconds: 0, storedElapsedSeconds: 0, pausedAt: null, timezone: body.timezone, lastInteractionAt: at, abandoned: false } as StudyTimerSnapshot;
    } else if (model.timer) {
      const timer = model.timer;
      const elapsed = (timer.storedElapsedSeconds ?? timer.elapsedSeconds) + (timer.status === "running" && timer.runningSince ? Math.max(0, Math.floor((Date.parse(at) - Date.parse(timer.runningSince)) / 1000)) : 0);
      if (body.action === "pause") model.timer = { ...timer, status: "paused", elapsedSeconds: elapsed, storedElapsedSeconds: elapsed, runningSince: null, pausedAt: at, pauseCount: timer.pauseCount + 1, lastInteractionAt: at };
      if (body.action === "resume") model.timer = { ...timer, status: "running", runningSince: at, pausedAt: null, pausedSeconds: timer.pausedSeconds + (timer.pausedAt ? Math.max(0, Math.floor((Date.parse(at) - Date.parse(timer.pausedAt)) / 1000)) : 0), lastInteractionAt: at };
      if (body.action === "finish") {
        model.analytics.recentSessions.unshift({ ...timer, id: String(result?.session_id ?? body.clientId), startedAt: timer.startedAt, endedAt: at, durationSeconds: Number(result?.duration_seconds ?? elapsed), completionState: "completed", understandingScore: null, focusRating: null, reflectionSavedAt: null });
        model.timer = null;
      }
      if (body.action === "discard") model.timer = null;
    }
    return model as T;
  }
  return input;
}
