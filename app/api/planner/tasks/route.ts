import { NextResponse } from "next/server";
import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TaskKind } from "@/lib/planner/types";

export const dynamic = "force-dynamic";
const KINDS: TaskKind[] = ["study", "revision", "test", "other"];

type Body =
  | { action: "create"; title: string; notes?: string; taskKind?: TaskKind; subjectId?: string | null; chapterId?: string | null; dueAt: string; estimatedMinutes?: number }
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

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage tasks." }, { status: 401 });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid task request." }, { status: 400 }); }
  const supabase = await createServerSupabaseClient();
  if (body.action === "create") {
    const title = body.title?.trim();
    const dueAt = new Date(body.dueAt);
    const estimated = Math.round(Number(body.estimatedMinutes ?? 30));
    const kind = body.taskKind ?? "study";
    if (!title || title.length > 160 || !Number.isFinite(dueAt.valueOf()) || !KINDS.includes(kind) || !Number.isFinite(estimated) || estimated < 1 || estimated > 720) return NextResponse.json({ error: "Check the task title, date, type and estimated minutes." }, { status: 400 });
    const academic = await academicIds(user.id);
    if (!academic) return NextResponse.json({ error: "Complete your academic profile before creating study tasks." }, { status: 409 });
    if (body.subjectId && !academic.subjects.has(body.subjectId)) return NextResponse.json({ error: "Selected subject is not applicable." }, { status: 403 });
    if (body.chapterId) {
      const chapterSubject = academic.chapters.get(body.chapterId);
      if (!chapterSubject || (body.subjectId && chapterSubject !== body.subjectId)) return NextResponse.json({ error: "Selected chapter is not applicable to this task." }, { status: 403 });
    }
    const response = await supabase.from("tasks").insert({ user_id: user.id, title, notes: body.notes?.trim() || null, task_kind: kind, subject_id: body.subjectId || null, chapter_id: body.chapterId || null, due_at: dueAt.toISOString(), estimated_minutes: estimated, status: "todo", completed_at: null }).select("*").single();
    if (response.error) return NextResponse.json({ error: "Task could not be created." }, { status: 409 });
    return NextResponse.json(response.data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!body.id) return NextResponse.json({ error: "Task id is required." }, { status: 400 });
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
