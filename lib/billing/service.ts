import "server-only";

import { optionalUser } from "@/lib/auth/server";
import { isCurrentGuestTestUser } from "@/lib/auth/cloudflare";
import { createD1AdminCompatClient } from "@/lib/data/d1/supabase-compat";
import { getSharedPublicJson, getCachedUserFeature } from "@/lib/cache/public";
import { invokeBillingService } from "./service-binding";

export type BillingCycle = "free" | "monthly" | "annual";
export type PlanTier = "free" | "basic" | "pro";
export type SubscriptionPlan = { id: string; tier_key: PlanTier; billing_cycle: BillingCycle; name: string; tagline: string; rank: number; price_subunits: number | null; currency: string; duration_value: number; duration_unit: string; active: boolean; checkout_enabled: boolean; sort_order: number };
export type PlanEntitlement = { plan_id: string; feature_key: string; enabled: boolean; limit_value: number | null; limit_unit: string; reset_period: string; upgrade_message: string };
export type Entitlement = { planId: string; tier: PlanTier; planName: string; featureKey: string; allowed: boolean; limitValue: number | null; limitUnit: string; resetPeriod: string; upgradeMessage: string };
export type BillingModel = { mode: "guest" | "ready"; currentPlan?: SubscriptionPlan; currentSubscription?: SubscriptionRow | null; payments?: PaymentRow[]; events?: SubscriptionEventRow[]; plans?: SubscriptionPlan[] };

type CurrentPlanRow = { plan_id: string; starts_at: string; ends_at: string | null };
type StorageRow = { size_bytes: number };
type IdRow = { id: string };
type ProfileLabelRow = { display_name: string | null };
type CreatedResourceRow = { id: string; moderation_status: string };
type SubscriptionRow = { id: string; plan_id: string; status: string; starts_at: string; ends_at: string | null; source: string; created_at?: string };
type PaymentRow = { id: string; plan_id: string; provider_order_id: string; provider_payment_id: string | null; amount_subunits: number; currency: string; status: string; created_at: string; paid_at: string | null };
type SubscriptionEventRow = { id: string; plan_id: string; event_type: string; source: string; starts_at: string | null; ends_at: string | null; created_at: string };

function db() { return createD1AdminCompatClient(); }
function asRows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function asRow<T extends object>(value: unknown): T | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as T : null; }

export async function listPlans(): Promise<SubscriptionPlan[]> {
  return getSharedPublicJson({
    namespace: "pricing",
    key: "plans-v1",
    ttlSeconds: 900,
    load: async () => {
      const result = await db().from("subscription_plans").select("id,tier_key,billing_cycle,name,tagline,rank,price_subunits,currency,duration_value,duration_unit,active,checkout_enabled,sort_order").eq("active", true).order("sort_order");
      if (result.error) throw new Error(result.error.message);
      return asRows<SubscriptionPlan>(result.data);
    },
  });
}

export async function listPlanEntitlements(): Promise<PlanEntitlement[]> {
  return getSharedPublicJson({
    namespace: "pricing",
    key: "entitlements-v1",
    ttlSeconds: 900,
    load: async () => {
      const result = await db().from("plan_entitlements").select("plan_id,feature_key,enabled,limit_value,limit_unit,reset_period,upgrade_message");
      if (result.error) throw new Error(result.error.message);
      return asRows<PlanEntitlement>(result.data);
    },
  });
}

async function currentPlanId(userId: string) {
  const client = db();
  const now = new Date();
  const current = await client.from("user_subscriptions").select("plan_id,ends_at,starts_at").eq("user_id", userId).eq("status", "active").lte("starts_at", now.toISOString()).order("starts_at", { ascending: false });
  if (current.error) throw new Error(current.error.message);
  const active = asRows<CurrentPlanRow>(current.data).find((item) => !item.ends_at || new Date(item.ends_at) > now);
  if (active?.plan_id) return active.plan_id;
  const free = await client.from("subscription_plans").select("id").eq("tier_key", "free").eq("billing_cycle", "free").eq("active", true).order("sort_order").limit(1).maybeSingle();
  if (free.error) throw new Error(free.error.message);
  return asRow<IdRow>(free.data)?.id ?? null;
}

export async function getEntitlementForUser(userId: string, featureKey: string): Promise<Entitlement> {
  if (await isCurrentGuestTestUser(userId)) return { planId: "guest-test", tier: "pro", planName: "Guest test access", featureKey, allowed: true, limitValue: null, limitUnit: "unlimited", resetPeriod: "never", upgradeMessage: "" };
  return getCachedEntitlement({
    userId,
    featureKey,
    load: async () => {
      try {
        const response = await invokeBillingService({ path: "/entitlement", method: "GET", userId, query: `?featureKey=${encodeURIComponent(featureKey)}` });
        const payload = await response.json().catch(() => null) as Partial<Entitlement> | { error?: string } | null;
        if (!response.ok || !payload || typeof payload !== "object" || typeof (payload as Partial<Entitlement>).featureKey !== "string") throw new Error(typeof (payload as { error?: unknown } | null)?.error === "string" ? (payload as { error: string }).error : "Billing entitlement lookup failed.");
        return payload as Entitlement;
      } catch {
        return { planId: "", tier: "free", planName: "Free", featureKey, allowed: false, limitValue: 0, limitUnit: "count", resetPeriod: "never", upgradeMessage: "Billing is temporarily unavailable. Please try again shortly." };
      }
    },
  });
}

export async function getResourceStorageAccess(userId: string) {
  const entitlement = await getEntitlementForUser(userId, "resources.storage");
  const result = await db().from("uploaded_resources").select("size_bytes").eq("owner_user_id", userId);
  if (result.error) throw new Error(result.error.message);
  const usedBytes = asRows<StorageRow>(result.data).reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0);
  const limitBytes = entitlement.limitUnit === "megabytes" && entitlement.limitValue !== null ? Math.floor(entitlement.limitValue * 1024 * 1024) : null;
  return { ...entitlement, usedBytes, limitBytes, remainingBytes: limitBytes === null ? null : Math.max(0, limitBytes - usedBytes) };
}

export async function createResourceMetadataWithinQuota(input: { userId: string; title: string; description: string | null; subjectId: string | null; chapterId: string | null; originalFilename: string; safeFilename: string; storagePath: string; mimeType: string; extension: string; sizeBytes: number; visibility: "private" | "shared" }) {
  const client = db();
  const access = await getResourceStorageAccess(input.userId);
  if (!access.allowed) throw new Error(access.upgradeMessage || "Resource storage is not available on this plan.");
  if (access.limitBytes !== null && access.usedBytes + input.sizeBytes > access.limitBytes) throw new Error("This upload would exceed your resource storage allowance.");
  const duplicateResult = await client.from("uploaded_resources").select("id").eq("storage_path", input.storagePath).maybeSingle();
  if (duplicateResult.error) throw new Error(duplicateResult.error.message);
  if (asRow<IdRow>(duplicateResult.data)) throw new Error("This resource upload has already been recorded.");
  const profileResult = await client.from("profiles").select("display_name").eq("user_id", input.userId).maybeSingle();
  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = asRow<ProfileLabelRow>(profileResult.data);
  const moderationStatus = input.visibility === "shared" ? "pending" : "private";
  const createdResult = await client.from("uploaded_resources").insert({ owner_user_id: input.userId, owner_label: profile?.display_name?.trim() || "CA Progress student", title: input.title, description: input.description, subject_id: input.subjectId, chapter_id: input.chapterId, original_filename: input.originalFilename, safe_filename: input.safeFilename, storage_bucket: "user-resources", storage_path: input.storagePath, mime_type: input.mimeType, extension: input.extension, size_bytes: input.sizeBytes, visibility: input.visibility, moderation_status: moderationStatus, published_at: null }).select("id,moderation_status").single();
  if (createdResult.error) throw new Error(createdResult.error.message);
  const created = asRow<CreatedResourceRow>(createdResult.data);
  if (!created) throw new Error("Resource metadata could not be created within the plan allowance.");
  const usedBytes = access.usedBytes + input.sizeBytes;
  return { id: created.id, moderationStatus: created.moderation_status, usedBytes, limitBytes: access.limitBytes };
}

export async function getPricingModel() {
  const [plans, entitlements, identity] = await Promise.all([listPlans(), listPlanEntitlements(), optionalUser()]);
  return { plans, entitlements, authenticated: Boolean(identity), currentPlanId: identity ? await currentPlanId(identity.id) : null };
}

export async function getBillingModel(): Promise<BillingModel> {
  const identity = await optionalUser(); if (!identity) return { mode: "guest" };
  const client = db(); const plans = await listPlans(); const planId = await currentPlanId(identity.id);
  const currentPlan = plans.find((plan) => plan.id === planId) ?? plans.find((plan) => plan.tier_key === "free" && plan.billing_cycle === "free");
  if (!currentPlan) throw new Error("No active subscription plan is configured.");
  const [subscriptionsResult, paymentsResult, eventsResult] = await Promise.all([
    client.from("user_subscriptions").select("id,plan_id,status,starts_at,ends_at,source,created_at").eq("user_id", identity.id).order("created_at", { ascending: false }).limit(25),
    client.from("payment_orders").select("id,plan_id,provider_order_id,provider_payment_id,amount_subunits,currency,status,created_at,paid_at").eq("user_id", identity.id).order("created_at", { ascending: false }).limit(25),
    client.from("subscription_events").select("id,plan_id,event_type,source,starts_at,ends_at,created_at").eq("user_id", identity.id).order("created_at", { ascending: false }).limit(25),
  ]);
  const error = subscriptionsResult.error || paymentsResult.error || eventsResult.error; if (error) throw new Error(error.message);
  const subscriptions = asRows<SubscriptionRow>(subscriptionsResult.data);
  const now = new Date();
  const currentSubscription = subscriptions.find((item) => item.plan_id === currentPlan.id && item.status === "active" && new Date(item.starts_at) <= now && (!item.ends_at || new Date(item.ends_at) > now)) ?? null;
  return { mode: "ready", currentPlan, currentSubscription, payments: asRows<PaymentRow>(paymentsResult.data), events: asRows<SubscriptionEventRow>(eventsResult.data), plans };
}
