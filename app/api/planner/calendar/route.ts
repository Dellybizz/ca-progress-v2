import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Body =
  | { action: "create"; title: string; notes?: string; startsAt: string; endsAt?: string | null; allDay?: boolean }
  | { action: "update"; id: string; title: string; notes?: string; startsAt: string; endsAt?: string | null; allDay?: boolean }
  | { action: "delete"; id: string };

function parsedDate(value: string | null | undefined) { if (!value) return null; const date = new Date(value); return Number.isFinite(date.valueOf()) ? date : null; }

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage calendar events." }, { status: 401 });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid calendar request." }, { status: 400 }); }
  const supabase = await createServerSupabaseClient();
  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Event id is required." }, { status: 400 });
    const response = await supabase.from("user_calendar_events").delete().eq("id", body.id).eq("user_id", user.id);
    if (response.error) return NextResponse.json({ error: "Calendar event could not be deleted." }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const title = body.title?.trim();
  const starts = parsedDate(body.startsAt);
  const ends = parsedDate(body.endsAt);
  if (!title || title.length > 160 || !starts || (body.endsAt && !ends) || (ends && ends < starts)) return NextResponse.json({ error: "Check the event title and time range." }, { status: 400 });
  const payload = { title, notes: body.notes?.trim() || null, starts_at: starts.toISOString(), ends_at: ends?.toISOString() ?? null, all_day: Boolean(body.allDay) };
  if (body.action === "create") {
    const response = await supabase.from("user_calendar_events").insert({ ...payload, user_id: user.id }).select("*").single();
    if (response.error) return NextResponse.json({ error: "Calendar event could not be created." }, { status: 409 });
    return NextResponse.json(response.data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  }
  if (body.action === "update") {
    if (!body.id) return NextResponse.json({ error: "Event id is required." }, { status: 400 });
    const response = await supabase.from("user_calendar_events").update(payload).eq("id", body.id).eq("user_id", user.id).select("id").maybeSingle();
    if (response.error || !response.data) return NextResponse.json({ error: "Calendar event could not be updated." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ error: "Unknown calendar action." }, { status: 400 });
}
