import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getPublicRuntimeConfig } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DashboardActionKey, DashboardAnalyticsEventType } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set<DashboardAnalyticsEventType>(["dashboard_view", "quick_action"]);
const ACTION_KEYS = new Set<DashboardActionKey>(["start_study", "add_task", "add_note", "open_progress"]);

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const eventType = typeof input.eventType === "string" && EVENT_TYPES.has(input.eventType as DashboardAnalyticsEventType)
    ? input.eventType as DashboardAnalyticsEventType
    : null;
  if (!eventType) return NextResponse.json({ error: "Unsupported dashboard event." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });

  const actionKey = typeof input.actionKey === "string" ? input.actionKey as DashboardActionKey : null;
  if (eventType === "quick_action" && (!actionKey || !ACTION_KEYS.has(actionKey))) {
    return NextResponse.json({ error: "Unsupported dashboard action." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  if (eventType === "dashboard_view" && actionKey) {
    return NextResponse.json({ error: "Dashboard views do not accept an action key." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("dashboard_events").insert({
    user_id: identity.id,
    event_type: eventType,
    action_key: eventType === "quick_action" ? actionKey : null,
    context: { surface: "dashboard", app_version: getPublicRuntimeConfig().appVersion },
  });
  if (error) return NextResponse.json({ error: "Dashboard event could not be recorded." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });

  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
