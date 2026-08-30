import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const response = await supabase.from("notes").delete().eq("id", id).eq("user_id", identity.id).select("id").maybeSingle();
  if (response.error) return NextResponse.json({ error: response.error.message }, { status: 400 });
  if (!response.data) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
