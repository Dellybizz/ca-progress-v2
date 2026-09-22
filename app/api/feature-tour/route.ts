import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import {
  getFeatureTourProgress,
  saveFeatureTourProgress,
} from "@/lib/mobile/feature-tour";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await optionalUser();
  if (!user)
    return NextResponse.json(
      { step: 0, completedAt: null, localOnly: true },
      { headers },
    );
  return NextResponse.json(await getFeatureTourProgress(user.id), { headers });
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to synchronize Feature Tour progress." },
      { status: 401, headers },
    );
  let input: { step?: unknown; completed?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid Feature Tour progress." },
      { status: 400, headers },
    );
  }
  if (
    !Number.isInteger(input.step) ||
    Number(input.step) < 0 ||
    Number(input.step) > 14 ||
    typeof input.completed !== "boolean"
  )
    return NextResponse.json(
      { error: "Invalid Feature Tour progress." },
      { status: 400, headers },
    );
  return NextResponse.json(
    await saveFeatureTourProgress(user.id, Number(input.step), input.completed),
    { headers },
  );
}
