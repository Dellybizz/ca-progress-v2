import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Body = { action: "create"; title: string; description?: string; dueDate: string } | { action: "toggle"; id: string; done: boolean } | { action: "delete"; id: string };

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage goals." }, { status: 401 });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid goal request." }, { status: 400 }); }
  const supabase = await createServerSupabaseClient();
  if (body.action === "create") {
    const title = body.title?.trim();
    if (!title || title.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) return NextResponse.json({ error: "Enter a goal title and valid due date." }, { status: 400 });
    const response = await supabase.from("goals").insert({ user_id: user.id, title, description: body.description?.trim() || null, due_date: body.dueDate, status: "active", completed_at: null }).select("*").single();
    if (response.error) return NextResponse.json({ error: "Goal could not be created." }, { status: 409 });
    return NextResponse.json(response.data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!body.id) return NextResponse.json({ error: "Goal id is required." }, { status: 400 });
  if (body.action === "toggle") {
    const response = await supabase.from("goals").update({ status: body.done ? "completed" : "active", completed_at: body.done ? new Date().toISOString() : null }).eq("id", body.id).eq("user_id", user.id).select("id").maybeSingle();
    if (response.error || !response.data) return NextResponse.json({ error: "Goal could not be updated." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (body.action === "delete") {
    const response = await supabase.from("goals").delete().eq("id", body.id).eq("user_id", user.id);
    if (response.error) return NextResponse.json({ error: "Goal could not be deleted." }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ error: "Unknown goal action." }, { status: 400 });
}
