import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getEntitlementForUser } from "@/lib/billing/service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Body = { itemIds?: unknown };

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Sign in to organise Today Plan." }, { status: 401 });

  const entitlement = await getEntitlementForUser(identity.id, "planner.smart");
  if (!entitlement.allowed) return NextResponse.json({ error: entitlement.upgradeMessage, code: "ENTITLEMENT_REQUIRED" }, { status: 403 });

  const body = await request.json().catch(() => null) as Body | null;
  const itemIds = Array.isArray(body?.itemIds) ? body!.itemIds.filter((value): value is string => typeof value === "string" && Boolean(value)) : [];
  if (!itemIds.length || itemIds.length > 100 || new Set(itemIds).size !== itemIds.length) {
    return NextResponse.json({ error: "Choose a valid Today Plan order." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const rows = await admin.from("daily_plan_items").select("id,plan_id,user_id").eq("user_id", identity.id).in("id", itemIds);
  if (rows.error || !rows.data || rows.data.length !== itemIds.length) {
    return NextResponse.json({ error: "One or more plan items could not be organised." }, { status: 409 });
  }

  const planIds = new Set(rows.data.map((row) => row.plan_id));
  if (planIds.size !== 1) return NextResponse.json({ error: "Plan items must belong to the same day." }, { status: 400 });

  for (let position = 0; position < itemIds.length; position += 1) {
    const updated = await admin
      .from("daily_plan_items")
      .update({ position, manual_override: true, manual_note: "Order adjusted" })
      .eq("id", itemIds[position])
      .eq("user_id", identity.id);
    if (updated.error) return NextResponse.json({ error: "Today Plan order could not be saved." }, { status: 409 });
  }

  await admin.from("planner_events").insert({
    user_id: identity.id,
    event_type: "manual_plan_change",
    entity_type: "daily_plan",
    entity_id: [...planIds][0],
    payload: { action: "reorder", itemIds },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
