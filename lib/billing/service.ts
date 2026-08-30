import "server-only";

import { optionalUser } from "@/lib/auth/server";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

export type BillingCycle = "free" | "monthly" | "annual";
export type PlanTier = "free" | "basic" | "pro";
export type SubscriptionPlan = { id: string; tier_key: PlanTier; billing_cycle: BillingCycle; name: string; tagline: string; rank: number; price_subunits: number | null; currency: string; duration_value: number; duration_unit: string; active: boolean; checkout_enabled: boolean; sort_order: number };
export type PlanEntitlement = { plan_id: string; feature_key: string; enabled: boolean; limit_value: number | null; limit_unit: string; reset_period: string; upgrade_message: string };
export type Entitlement = { planId: string; tier: PlanTier; planName: string; featureKey: string; allowed: boolean; limitValue: number | null; limitUnit: string; resetPeriod: string; upgradeMessage: string };
export type BillingModel = { mode: "guest" | "ready"; currentPlan?: SubscriptionPlan; currentSubscription?: { id: string; status: string; starts_at: string; ends_at: string | null; source: string } | null; payments?: Array<{ id: string; plan_id: string; provider_order_id: string; provider_payment_id: string | null; amount_subunits: number; currency: string; status: string; created_at: string; paid_at: string | null }>; events?: Array<{ id: string; plan_id: string; event_type: string; source: string; starts_at: string | null; ends_at: string | null; created_at: string }>; plans?: SubscriptionPlan[] };

function config() { const value = getSupabaseAdminRuntimeConfig(); if (!value.configured) throw new Error("V2 billing database configuration is unavailable."); return value; }
async function rest(path: string, init: RequestInit = {}) {
  const db = config(); const headers = new Headers(init.headers); headers.set("apikey", db.serviceRoleKey); headers.set("authorization", `Bearer ${db.serviceRoleKey}`); headers.set("accept", "application/json"); if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${db.url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" }); const text = await response.text(); const data: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) { const message = data && typeof data === "object" && "message" in data ? String((data as { message?: unknown }).message) : `Billing data request failed (${response.status}).`; throw new Error(message); }
  return data;
}

export async function listPlans(): Promise<SubscriptionPlan[]> { const data = await rest("subscription_plans?active=eq.true&select=id,tier_key,billing_cycle,name,tagline,rank,price_subunits,currency,duration_value,duration_unit,active,checkout_enabled,sort_order&order=sort_order.asc"); return Array.isArray(data) ? data as SubscriptionPlan[] : []; }
export async function listPlanEntitlements(): Promise<PlanEntitlement[]> { const data = await rest("plan_entitlements?select=plan_id,feature_key,enabled,limit_value,limit_unit,reset_period,upgrade_message"); return Array.isArray(data) ? data as PlanEntitlement[] : []; }

export async function getEntitlementForUser(userId: string, featureKey: string): Promise<Entitlement> {
  const data = await rest("rpc/phase11_effective_entitlement", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_feature_key: featureKey }) });
  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (!row) return { planId: "", tier: "free", planName: "Free", featureKey, allowed: false, limitValue: 0, limitUnit: "count", resetPeriod: "never", upgradeMessage: "This feature is not available on your current plan." };
  return { planId: String(row.plan_id ?? ""), tier: String(row.tier_key ?? "free") as PlanTier, planName: String(row.plan_name ?? "Free"), featureKey: String(row.feature_key ?? featureKey), allowed: Boolean(row.allowed), limitValue: row.limit_value === null || row.limit_value === undefined ? null : Number(row.limit_value), limitUnit: String(row.limit_unit ?? "unlimited"), resetPeriod: String(row.reset_period ?? "never"), upgradeMessage: String(row.upgrade_message ?? "Upgrade your plan to use this feature.") };
}

export async function getResourceStorageAccess(userId: string) {
  const entitlement = await getEntitlementForUser(userId, "resources.storage");
  const rows = await rest(`uploaded_resources?owner_user_id=eq.${encodeURIComponent(userId)}&select=size_bytes`);
  const usedBytes = Array.isArray(rows) ? rows.reduce((sum, row) => sum + Number((row as { size_bytes?: unknown }).size_bytes ?? 0), 0) : 0;
  const limitBytes = entitlement.limitUnit === "megabytes" && entitlement.limitValue !== null ? Math.floor(entitlement.limitValue * 1024 * 1024) : null;
  return { ...entitlement, usedBytes, limitBytes, remainingBytes: limitBytes === null ? null : Math.max(0, limitBytes - usedBytes) };
}

export async function createResourceMetadataWithinQuota(input: { userId: string; title: string; description: string | null; subjectId: string | null; chapterId: string | null; originalFilename: string; safeFilename: string; storagePath: string; mimeType: string; extension: string; sizeBytes: number; visibility: "private" | "shared" }) {
  const data = await rest("rpc/phase11_create_uploaded_resource", { method: "POST", body: JSON.stringify({ p_user_id: input.userId, p_title: input.title, p_description: input.description, p_subject_id: input.subjectId, p_chapter_id: input.chapterId, p_original_filename: input.originalFilename, p_safe_filename: input.safeFilename, p_storage_path: input.storagePath, p_mime_type: input.mimeType, p_extension: input.extension, p_size_bytes: input.sizeBytes, p_visibility: input.visibility }) });
  const row = Array.isArray(data) ? data[0] as { id?: unknown; moderation_status?: unknown; used_bytes?: unknown; limit_bytes?: unknown } | undefined : undefined;
  if (!row?.id) throw new Error("Resource metadata could not be created within the plan allowance.");
  return { id: String(row.id), moderationStatus: String(row.moderation_status ?? "private"), usedBytes: Number(row.used_bytes ?? 0), limitBytes: row.limit_bytes === null || row.limit_bytes === undefined ? null : Number(row.limit_bytes) };
}

export async function getPricingModel() {
  const [plans, entitlements, identity] = await Promise.all([listPlans(), listPlanEntitlements(), optionalUser()]); let currentPlanId: string | null = null;
  if (identity) { const data = await rest("rpc/phase11_current_plan_id", { method: "POST", body: JSON.stringify({ p_user_id: identity.id }) }); currentPlanId = typeof data === "string" ? data : null; }
  return { plans, entitlements, authenticated: Boolean(identity), currentPlanId };
}

export async function getBillingModel(): Promise<BillingModel> {
  const identity = await optionalUser(); if (!identity) return { mode: "guest" };
  const plans = await listPlans(); const planIdData = await rest("rpc/phase11_current_plan_id", { method: "POST", body: JSON.stringify({ p_user_id: identity.id }) }); const currentPlanId = typeof planIdData === "string" ? planIdData : "";
  const currentPlan = plans.find((plan) => plan.id === currentPlanId) ?? plans.find((plan) => plan.tier_key === "free" && plan.billing_cycle === "free")!;
  const subscriptionsData = await rest(`user_subscriptions?user_id=eq.${encodeURIComponent(identity.id)}&select=id,plan_id,status,starts_at,ends_at,source,created_at&order=created_at.desc&limit=25`); const subscriptions = Array.isArray(subscriptionsData) ? subscriptionsData as Array<{ id: string; plan_id: string; status: string; starts_at: string; ends_at: string | null; source: string; created_at: string }> : [];
  const currentSubscription = subscriptions.find((item) => item.plan_id === currentPlan.id && item.status === "active" && new Date(item.starts_at) <= new Date() && (!item.ends_at || new Date(item.ends_at) > new Date())) ?? null;
  const paymentsData = await rest(`payment_orders?user_id=eq.${encodeURIComponent(identity.id)}&select=id,plan_id,provider_order_id,provider_payment_id,amount_subunits,currency,status,created_at,paid_at&order=created_at.desc&limit=25`);
  const eventsData = await rest(`subscription_events?user_id=eq.${encodeURIComponent(identity.id)}&select=id,plan_id,event_type,source,starts_at,ends_at,created_at&order=created_at.desc&limit=25`);
  return { mode: "ready", currentPlan, currentSubscription, payments: Array.isArray(paymentsData) ? paymentsData as NonNullable<BillingModel["payments"]> : [], events: Array.isArray(eventsData) ? eventsData as NonNullable<BillingModel["events"]> : [], plans };
}
