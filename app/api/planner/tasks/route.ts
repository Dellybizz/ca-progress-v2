import { NextResponse } from "next/server";
import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";
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

async function academicIds(userId: string) {
  const profile = await getProfileForUser(userId);
  if (!profile?.onboarding_completed_at || !isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key || profile.attempt_key === "undecided") return null;
  const catalog = await getAcademicCatalog({ level: profile.ca_level, group: profile.group_choice, attempt: profile.attempt_key });
  const subjects = new Set(catalog.subjects.map((subject) => subject.id));
  const chapters = new Map(catalog.subjects.flatMap((subject) => subject.chapters.map((chapter) => [chapter.id, subject.id] as const)));
  return { subjects, chapters };
}

async function validatedTaskFields(userId: string, body: TaskFields) {
  const title = body.title?.trim();
  const dueAt = new Date(body.dueAt);
  const estimated = Math.round(Number(body.estimatedMinutes ?? 30));
  const kind = body.taskKind ?? "study";
  if (!title || title.length > 160 || !Number.isFinite(dueAt.valueOf()) || !KINDS.includes(kind) || !Number.isFinite(estimated) || estimated < 1 || estimated > 720) {
    return { error: NextResponse.json({ error: "Check the task title, date, type and estimated minutes." }, { status: 400 }) } as const;
  }
  const academic = await academicIds(userId);
  if (!academic) return { error: NextResponse.json({ error: "Complete your academic profile before managing study tasks." }, { status: 409 }) } as const;
  if (body.subjectId && !academic.subjects.has(body.subjectId)) return { error: NextResponse.json({ error: "Selected subject is not applicable." }, { status: 403 }) } as const;
  if (body.chapterId) {
    const chapterSubject = academic.chapters.get(body.chapterId);
    if (!chapterSubject || (body.subjectId && chapterSubject !== body.subjectId)) return { error: NextResponse.json({ error: "Selected chapter is not applicable to this task." }, { status: 403 }) } as const;
  }
  return {
    values: {
      title,
      notes: body.notes?.trim() || null,
      task_kind: kind,
      subject_id: body.subjectId || null,
      chapter_id: body.chapterId || null,
      due_at: dueAt.toISOString(),
      estimated_minutes: estimated,
    },
  } as const;
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage tasks." }, { status: 401 });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid task request." }, { status: 400 }); }
  if (isCloudflareDataRuntime()) {
    try {
      if (body.action === "create" || body.action === "update") {
        const task = { title: body.title?.trim() || "", notes: body.notes?.trim() || null, taskKind: body.taskKind ?? "study", subjectId: body.subjectId || null, chapterId: body.chapterId || null, dueAt: body.dueAt, estimatedMinutes: Math.round(Number(body.estimatedMinutes ?? 30)) };
        const result = body.action === "create" ? await createHotTask(user.id, task) : await updateHotTask(user.id, body.id, task);
        return NextResponse.json(result, { status: body.action === "create" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
      }
      if (body.action === "toggle") return NextResponse.json(await toggleHotTask(user.id, body.id, body.done), { headers: { "Cache-Control": "private, no-store" } });
      if (body.action === "delete") return NextResponse.json(await deleteHotTask(user.id, body.id), { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Task could not be saved." }, { status: 400 });
    }
  }

  const supabase = await createServerSupabaseClient();

  if (body.action === "create") {
    const validated = await validatedTaskFields(user.id, body);
    if ("error" in validated) return validated.error;
    const response = await supabase.from("tasks").insert({ user_id: user.id, ...validated.values, status: "todo", completed_at: null }).select("*").single();
    if (response.error) return NextResponse.json({ error: "Task could not be created." }, { status: 409 });
    return NextResponse.json(response.data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  }

  if (!body.id) return NextResponse.json({ error: "Task id is required." }, { status: 400 });

  if (body.action === "update") {
    const validated = await validatedTaskFields(user.id, body);
    if ("error" in validated) return validated.error;
    const response = await supabase.from("tasks").update(validated.values).eq("id", body.id).eq("user_id", user.id).select("id").maybeSingle();
    if (response.error || !response.data) return NextResponse.json({ error: "Task could not be updated." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (body.action === "toggle") {
    const response = await supabase.from("tasks").update({ status: body.done ? "done" : "todo", completed_at: body.done ? new Date().toISOString() : null }).eq("id", body.id).eq("user_id", user.id).select("id").maybeSingle();
    if (response.error || !response.data) return NextResponse.json({ error: "Task could not be updated." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (body.action === "delete") {
    const response = await supabase.from("tasks").delete().eq("id", body.id).eq("user_id", user.id);
    if (response.error) return NextResponse.json({ error: "Task could not be deleted." }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  return NextResponse.json({ error: "Unknown task action." }, { status: 400 });
}
