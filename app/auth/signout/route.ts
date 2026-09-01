import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { signOutCurrentSession } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await signOutCurrentSession();
  } catch {
    // A missing/expired session is already signed out from the application's perspective.
  }
  revalidatePath("/", "layout");
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
