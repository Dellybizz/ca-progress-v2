import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createHotGoal, deleteHotGoal, toggleHotGoal } from "@/lib/data/d1/hot-screens";

export const dynamic = "force-dynamic";
type Body = { action: "create"; title: string; description?: string; dueDate: string } | { action: "toggle"; id: string; done: boolean } | { action: "delete"; id: string };

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage goals." }, { status: 401 });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid goal request." }, { status: 400 }); }
  try {
    if (body.action === "create") return NextResponse.json(await createHotGoal(user.id, { title: body.title?.trim() || "", description: body.description?.trim() || null, dueDate: body.dueDate }), { status: 201, headers: { "Cache-Control": "private, no-store" } });
    if (body.action === "toggle") return NextResponse.json(await toggleHotGoal(user.id, body.id, body.done), { headers: { "Cache-Control": "private, no-store" } });
    if (body.action === "delete") return NextResponse.json(await deleteHotGoal(user.id, body.id), { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ error: "Unknown goal action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Goal could not be saved." }, { status: 400 });
  }
}
