import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) await supabase.auth.signOut();
  } catch {
    // A missing/expired session is already signed out from the application's perspective.
  }
  revalidatePath("/", "layout");
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
