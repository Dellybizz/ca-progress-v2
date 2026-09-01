import "server-only";

import { optionalUser } from "@/lib/auth/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type BillingCycle = "free" | "monthly" | "annual";
export type PlanTier = "free" | "basic" | "pro";
export type SubscriptionPlan = { id: string; tier_key: PlanTier; billing_cycle: BillingCycle; name: string; tagline: string; rank: number; price_subunits: number | null; currency: string; duration_value: number; duration_unit: string; active: boolean; checkout_enabled: boolean; sort_order: number };
export type PlanEntitlement = { plan_id: string; feature_key: string; enabled: boolean; limit_value: number | null; limit_unit: string; reset_period: string; upgrade_message: string };
export type Entitlement = { planId: string; tier: PlanTier; planName: string; featureKey: string; allowed: boolean; limitValue: number | null; limitUnit: string; resetPeriod: string; upgradeMessage: string };
export type BillingModel = { mode: "guest" | "ready"; currentPlan?: SubscriptionPlan; currentSubscription?: { id: string; status: string; starts_at: string; ends_at: string | null; source: string } | null; payments?: Array<{ id: string; plan_id: string; provider_order_id: string; provider_payment_id: string | null; amount_subunits: number; currency: string; status: string; created_at: string; paid_at: string | null }>; events?: Array<{ id: string; plan_id: string; event_type: string; source: string; starts_at: string | null; ends_at: string | null; created_at: string }>; plans?: SubscriptionPlan[] };

function db() { return createAdminSupabaseClient(); }

export async function listPlans(): Promise<SubscriptionPlan[]> {
  const result = await db().from("subscription_plans").select("id,tier_key,billing_cycle,name,tagline,rank,price_subunits,currency,duration_value,duration_unit,active,checkout_enabled,sort_order").eq("active", true).order("sort_order");
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as SubscriptionPlan[];
}

export async function listPlanEntitlements(): Promise<PlanEntitlement[]> {
  const result = await db().from("plan_entitlements").select("plan_id,feature_key,enabled,limit_value,limit_unit,reset_period,upgrade_message");
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as PlanEntitlement[];
}

async function currentPlanId(userId: string) {
  const client = db();
  const now = new Date().toISOString();
  const current = await client.from("user_subscriptions").select("plan_id,ends_at,starts_at").eq("user_id", userId).eq("status", "active").lte("starts_at", now).gt("ends_at", now).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (current.data?.plan_id) return current.data.plan_id;
  const free = await client.from("subscription_plans").select("id").eq("tier_key", "free").eq("billing_cycle", "free").eq("active", true).order("sort_order").limit(1).maybeSingle();
  if (free.error) throw new Error(free.error.message);
  return free.data?.id ?? null;
}

export async function getEntitlementForUser(userId: string, featureKey: string): Promise<Entitlement> {
  const client = db();
  const planId = await currentPlanId(userId);
  if (!planId) return { planId: "", tier: "free", planName: "Free", featureKey, allowed: false, limitValue: 0, limitUnit: "count", resetPeriod: "never", upgradeMessage: "This feature is not available on your current plan." };
  const [plan, entitlement] = await Promise.all([
    client.from("subscription_plans").select("id,tier_key,name").eq("id", planId).maybeSingle(),
    client.from("plan_entitlements").select("plan_id,feature_key,enabled,limit_value,limit_unit,reset_period,upgrade_message").eq("plan_id", planId).eq("feature_key", featureKey).maybeSingle(),
  ]);
  if (plan.error || entitlement.error) throw new Error((plan.error || entitlement.error)!.message);
  const row = entitlement.data;
  return { planId, tier: (plan.data?.tier_key ?? "free") as PlanTier, planName: plan.data?.name ?? "Free", featureKey, allowed: Boolean(row?.enabled), limitValue: row?.limit_value == null ? null : Number(row.limit_value), limitUnit: row?.limit_unit ?? "unlimited", resetPeriod: row?.reset_period ?? "never", upgradeMessage: row?.upgrade_message ?? "Upgrade your plan to use this feature." };
}

export async function getResourceStorageAccess(userId: string) {
  const entitlement = await getEntitlementForUser(userId, "resources.storage");
  const rows = await db().from("uploaded_resources").select("size_bytes").eq("owner_user_id", userId);
  if (rows.error) throw new Error(rows.error.message);
  const usedBytes = (rows.data ?? []).reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0);
  const limitBytes = entitlement.limitUnit === "megabytes" && entitlement.limitValue !== null ? Math.floor(entitlement.limitValue * 1024 * 1024) : null;
  return { ...entitlement, usedBytes, limitBytes, remainingBytes: limitBytes === null ? null : Math.max(0, limitBytes - usedBytes) };
}

export async function createResourceMetadataWithinQuota(input: { userId: string; title: string; description: string | null; subjectId: string | null; chapterId: string | null; originalFilename: string; safeFilename: string; storagePath: string; mimeType: string; extension: string; sizeBytes: number; visibility: "private" | "shared" }) {
  const client = db();
  const access = await getResourceStorageAccess(input.userId);
  if (!access.allowed) throw new Error(access.upgradeMessage || "Resource storage is not available on this plan.");
  if (access.limitBytes !== null && access.usedBytes + input.sizeBytes > access.limitBytes) throw new Error("This upload would exceed your resource storage allowance.");
  const duplicate = await client.from("uploaded_resources").select("id").eq("storage_path", input.storagePath).maybeSingle();
  if (duplicate.error) throw new Error(duplicate.error.message);
  if (duplicate.data) throw new Error("This resource upload has already been recorded.");
  const profile = await client.from("profiles").select("display_name").eq("user_id", input.userId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  const moderationStatus = input.visibility === "shared" ? "pending" : "private";
  const created = await client.from("uploaded_resources").insert({ owner_user_id: input.userId, owner_label: profile.data?.display_name?.trim() || "CA Progress student", title: input.title, description: input.description, subject_id: input.subjectId, chapter_id: input.chapterId, original_filename: input.originalFilename, safe_filename: input.safeFilename, storage_bucket: "user-resources", storage_path: input.storagePath, mime_type: input.mimeType, extension: input.extension, size_bytes: input.sizeBytes, visibility: input.visibility, moderation_status: moderationStatus, published_at: null }).select("id,moderation_status").single();
  if (created.error || !created.data) throw new Error(created.error?.message || "Resource metadata could not be created within the plan allowance.");
  const usedBytes = access.usedBytes + input.sizeBytes;
  return { id: created.data.id, moderationStatus: created.data.moderation_status, usedBytes, limitBytes: access.limitBytes };
}

export async function getPricingModel() {
  const [plans, entitlements, identity] = await Promise.all([listPlans(), listPlanEntitlements(), optionalUser()]);
  return { plans, entitlements, authenticated: Boolean(identity), currentPlanId: identity ? await currentPlanId(identity.id) : null };
}

export async function getBillingModel(): Promise<BillingModel> {
  const identity = await optionalUser(); if (!identity) return { mode: "guest" };
  const client = db(); const plans = await listPlans(); const planId = await currentPlanId(identity.id);
  const currentPlan = plans.find((plan) => plan.id === planId) ?? plans.find((plan) => plan.tier_key === "free" && plan.billing_cycle === "free")!;
  const [subscriptionsResult, paymentsResult, eventsResult] = await Promise.all([
    client.from("user_subscriptions").select("id,plan_id,status,starts_at,ends_at,source,created_at").eq("user_id", identity.id).order("created_at", { ascending: false }).limit(25),
    client.from("payment_orders").select("id,plan_id,provider_order_id,provider_payment_id,amount_subunits,currency,status,created_at,paid_at").eq("user_id", identity.id).order("created_at", { ascending: false }).limit(25),
    client.from("subscription_events").select("id,plan_id,event_type,source,starts_at,ends_at,created_at").eq("user_id", identity.id).order("created_at", { ascending: false }).limit(25),
  ]);
  const error = subscriptionsResult.error || paymentsResult.error || eventsResult.error; if (error) throw new Error(error.message);
  const subscriptions = subscriptionsResult.data ?? [];
  const currentSubscription = subscriptions.find((item) => item.plan_id === currentPlan.id && item.status === "active" && new Date(item.starts_at) <= new Date() && (!item.ends_at || new Date(item.ends_at) > new Date())) ?? null;
  return { mode: "ready", currentPlan, currentSubscription, payments: (paymentsResult.data ?? []) as NonNullable<BillingModel["payments"]>, events: (eventsResult.data ?? []) as NonNullable<BillingModel["events"]>, plans };
}
