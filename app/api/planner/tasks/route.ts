import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createPhase8Task, deletePhase8Task, togglePhase8Task, updatePhase8Task } from "@/lib/planner/phase8";
import type { TaskKind, TaskScheduleMode } from "@/lib/planner/types";

export const dynamic = "force-dynamic";
const KINDS: TaskKind[] = ["class", "study", "revision", "test", "mock", "personal", "other"];
const SCHEDULE_MODES: TaskScheduleMode[] = ["fixed", "flexible"];

type TaskFields = {
  title: string;
  notes?: string;
  taskKind?: TaskKind;
  subjectId?: string | null;
  chapterId?: string | null;
  dueAt: string;
  scheduleMode?: TaskScheduleMode;
  targetDate?: string | null;
  estimatedMinutes?: number;
};

type Body =
  | ({ action: "create" } & TaskFields)
  | ({ action: "update"; id: string } & TaskFields)
  | { action: "toggle"; id: string; done: boolean }
  | { action: "delete"; id: string };

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage tasks." }, { status: 401 });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid task request." }, { status: 400 }); }

  try {
    if (body.action === "create" || body.action === "update") {
      const kind = body.taskKind ?? "study";
      const scheduleMode = body.scheduleMode ?? "fixed";
      if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unsupported task type." }, { status: 400 });
      if (!SCHEDULE_MODES.includes(scheduleMode)) return NextResponse.json({ error: "Unsupported schedule mode." }, { status: 400 });
      const task = {
        title: body.title?.trim() || "",
        notes: body.notes?.trim() || null,
        taskKind: kind,
        subjectId: body.subjectId || null,
        chapterId: body.chapterId || null,
        dueAt: body.dueAt,
        scheduleMode,
        targetDate: body.targetDate || null,
        estimatedMinutes: Math.round(Number(body.estimatedMinutes ?? 30)),
      };
      const result = body.action === "create" ? await createPhase8Task(user.id, task) : await updatePhase8Task(user.id, body.id, task);
      return NextResponse.json(result, { status: body.action === "create" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action === "toggle") return NextResponse.json(await togglePhase8Task(user.id, body.id, body.done), { headers: { "Cache-Control": "private, no-store" } });
    if (body.action === "delete") return NextResponse.json(await deletePhase8Task(user.id, body.id), { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ error: "Unknown task action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Task could not be saved." }, { status: 400 });
  }
}
