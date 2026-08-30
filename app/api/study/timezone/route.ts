import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let timezone = "";
  try { const body = await request.json() as { timezone?: string }; timezone = body.timezone?.trim() || ""; } catch { return NextResponse.json({ error: "Invalid timezone request." }, { status: 400 }); }
  if (!timezone || timezone.length > 80) return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const response = await supabase.rpc("phase6_set_timezone", { p_timezone: timezone });
  if (response.error) return NextResponse.json({ error: response.error.message.includes("Unknown timezone") ? "Unknown timezone." : "Timezone could not be saved." }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
