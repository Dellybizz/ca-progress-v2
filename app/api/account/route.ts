import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { deleteAccountData } from "@/lib/auth/account-deletion";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "ACCOUNT_DELETE_FAILED";
  if (code === "PARENT_OWNER_DELETE_BLOCKED") return NextResponse.json({ ok: false, error: "Parent owner access must be transferred before this account can be deleted." }, { status: 409 });
  if (code === "SOLE_OWNER_DELETE_BLOCKED") return NextResponse.json({ ok: false, error: "Add another active owner before deleting the only owner account." }, { status: 409 });
  if (code === "ACCOUNT_DELETE_STORAGE_UNAVAILABLE" || code === "ACCOUNT_DELETE_STORAGE_FAILED" || code === "ACCOUNT_DELETE_AVATAR_FAILED") return NextResponse.json({ ok: false, error: "Your account was not deleted because private file cleanup could not be completed safely. Please try again." }, { status: 503 });
  return NextResponse.json({ ok: false, error: "We could not delete your account right now. Nothing else needs to be changed; please try again." }, { status: 500 });
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ ok: false, error: "Invalid account deletion request." }, { status: 403 });

  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in again before deleting your account." }, { status: 401 });

  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "DELETE") return NextResponse.json({ ok: false, error: "Type DELETE to confirm permanent account deletion." }, { status: 400 });

  try {
    await deleteAccountData(user.id);
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // The auth user is already deleted; an old cookie is harmless and will fail identity validation.
    }
    return NextResponse.json({ ok: true, redirect: "/login?deleted=1" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
