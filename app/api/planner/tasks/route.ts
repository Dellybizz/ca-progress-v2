import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createHotTask, deleteHotTask, toggleHotTask, updateHotTask } from "@/lib/data/d1/hot-screens";
import type { TaskKind } from "@/lib/planner/types";

export const dynamic = "force-dynamic";
const KINDS: TaskKind[] = ["study", "revision", "test", "other"];

type TaskFields = {
  title: string;
  notes?: string;
  taskKind?: TaskKind;
  subjectId?: string | null;
  chapterId?: string | null;
  dueAt: string;
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
      if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unsupported task type." }, { status: 400 });
      const task = {
        title: body.title?.trim() || "",
        notes: body.notes?.trim() || null,
        taskKind: kind,
        subjectId: body.subjectId || null,
        chapterId: body.chapterId || null,
        dueAt: body.dueAt,
        estimatedMinutes: Math.round(Number(body.estimatedMinutes ?? 30)),
      };
      const result = body.action === "create" ? await createHotTask(user.id, task) : await updateHotTask(user.id, body.id, task);
      return NextResponse.json(result, { status: body.action === "create" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action === "toggle") return NextResponse.json(await toggleHotTask(user.id, body.id, body.done), { headers: { "Cache-Control": "private, no-store" } });
    if (body.action === "delete") return NextResponse.json(await deleteHotTask(user.id, body.id), { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ error: "Unknown task action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Task could not be saved." }, { status: 400 });
  }
}
