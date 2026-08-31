import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export async function POST(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to update your guide." }, { status: 401 });
  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (!body || (body.action !== "complete" && body.action !== "skip")) return NextResponse.json({ ok: false, error: "Invalid guide action." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const update = { feature_guide_completed_at: new Date().toISOString() } as unknown as ProfileUpdate;
  const { error } = await supabase.from("profiles").update(update).eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: "Could not update the guide right now." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
