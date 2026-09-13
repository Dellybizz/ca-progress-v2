import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to save test marks." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({
    error: "The old mutable test-milestone endpoint is retired. Save a new immutable attempt through the Test Archive instead.",
    code: "TEST_STAGE_MUTATION_RETIRED",
  }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
