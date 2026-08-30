import "server-only";

import { type AdminOperator } from "@/lib/admin/authorization";
import { invokeBillingService } from "@/lib/billing/service-binding";
import { getResourceR2Bucket } from "@/lib/resources/r2";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

export { canManageOperations, canManagePlatform, canManageRoles, getAdminRoleForUser, requireAdminOperator } from "@/lib/admin/authorization";
export type { AdminOperator, AdminRole } from "@/lib/admin/authorization";
export type HealthState = "ok" | "degraded" | "not_configured";

function config() {
  const value = getSupabaseAdminRuntimeConfig();
  if (!value.configured) throw new Error("Admin database unavailable.");
  return value;
}

async function rest(path: string, init: RequestInit = {}) {
  const db = config();
  const headers = new Headers(init.headers);
  headers.set("apikey", db.serviceRoleKey);
  headers.set("authorization", `Bearer ${db.serviceRoleKey}`);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${db.url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Admin request failed (${response.status}).`);
  return response.status === 204 ? null : response.json() as Promise<unknown>;
}

function rpc(name: string, body: Record<string, unknown>) {
  return rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

export type MemberRow = {
  user_id: string; email: string | null; display_name: string; role: string; admin_active: boolean;
  plan_tier: string; plan_name: string; subscription_ends_at: string | null; user_created_at: string; total_count: number;
};

export async function listMembers(operator: AdminOperator, input: { page: number; limit: number; search?: string; role?: string }) {
  const data = await rpc("phase12_list_members", { p_actor: operator.userId, p_page: input.page, p_limit: input.limit, p_search: input.search?.trim() || null, p_role: input.role?.trim() || null });
  const rows = Array.isArray(data) ? data as MemberRow[] : [];
  return { rows, total: rows[0]?.total_count ? Number(rows[0].total_count) : 0, page: input.page, limit: input.limit };
}

export function setMemberRole(operator: AdminOperator, targetUserId: string, role: import("@/lib/admin/authorization").AdminRole) {
  return rpc("phase12_set_admin_role", { p_actor: operator.userId, p_target: targetUserId, p_new_role: role, p_request_id: crypto.randomUUID() });
}
export function setMemberAdminActive(operator: AdminOperator, targetUserId: string, active: boolean) {
  return rpc("phase12_set_admin_active", { p_actor: operator.userId, p_target: targetUserId, p_active: active, p_request_id: crypto.randomUUID() });
}

export async function getPlatformModel() {
  const [flags, maintenance] = await Promise.all([
    rest("feature_flags?select=flag_key,label,description,enabled,updated_at&order=flag_key.asc"),
    rest("maintenance_settings?id=eq.true&select=enabled,message,starts_at,ends_at,updated_at&limit=1"),
  ]);
  return { flags: Array.isArray(flags) ? flags : [], maintenance: Array.isArray(maintenance) ? maintenance[0] ?? null : null };
}
export function setFeatureFlag(operator: AdminOperator, flagKey: string, enabled: boolean) {
  return rpc("phase12_set_feature_flag", { p_actor: operator.userId, p_flag_key: flagKey, p_enabled: enabled, p_request_id: crypto.randomUUID() });
}
export function setMaintenance(operator: AdminOperator, input: { enabled: boolean; message: string; startsAt?: string | null; endsAt?: string | null }) {
  return rpc("phase12_set_maintenance", { p_actor: operator.userId, p_enabled: input.enabled, p_message: input.message, p_starts_at: input.startsAt || null, p_ends_at: input.endsAt || null, p_request_id: crypto.randomUUID() });
}

export async function getPlansAdminModel() {
  const [plans, entitlements] = await Promise.all([
    rest("subscription_plans?select=id,tier_key,billing_cycle,name,price_subunits,currency,duration_value,duration_unit,active,checkout_enabled,sort_order&order=sort_order.asc"),
    rest("plan_entitlements?select=plan_id,feature_key,enabled,limit_value,limit_unit,upgrade_message&order=feature_key.asc"),
  ]);
  return { plans: Array.isArray(plans) ? plans : [], entitlements: Array.isArray(entitlements) ? entitlements : [] };
}
export function updatePlan(operator: AdminOperator, input: { planId: string; priceSubunits: number | null; checkoutEnabled: boolean; active: boolean }) {
  return rpc("phase12_update_plan", { p_actor: operator.userId, p_plan_id: input.planId, p_price_subunits: input.priceSubunits, p_checkout_enabled: input.checkoutEnabled, p_active: input.active, p_request_id: crypto.randomUUID() });
}
export function updateEntitlement(operator: AdminOperator, input: { planId: string; featureKey: string; enabled: boolean; limitValue: number | null; limitUnit: string; upgradeMessage: string }) {
  return rpc("phase12_update_entitlement", { p_actor: operator.userId, p_plan_id: input.planId, p_feature_key: input.featureKey, p_enabled: input.enabled, p_limit_value: input.limitValue, p_limit_unit: input.limitUnit, p_upgrade_message: input.upgradeMessage, p_request_id: crypto.randomUUID() });
}

export async function getNotificationTemplates() {
  const data = await rest("notification_templates?select=id,template_key,name,title,body,is_active,updated_at&order=updated_at.desc&limit=100");
  return Array.isArray(data) ? data : [];
}
export function saveNotificationTemplate(operator: AdminOperator, input: { id?: string | null; templateKey: string; name: string; title: string; body: string; active: boolean }) {
  return rpc("phase12_upsert_notification_template", { p_actor: operator.userId, p_id: input.id || null, p_template_key: input.templateKey, p_name: input.name, p_title: input.title, p_body: input.body, p_active: input.active, p_request_id: crypto.randomUUID() });
}

export async function getAuditLog(input: { page: number; limit: number; action?: string; actor?: string }) {
  const filters = ["select=id,actor_user_id,actor_role,action_key,entity_type,entity_id,request_id,before_state,after_state,metadata,created_at", "order=created_at.desc", `limit=${input.limit}`, `offset=${Math.max(0, (input.page - 1) * input.limit)}`];
  if (input.action) filters.push(`action_key=ilike.*${encodeURIComponent(input.action)}*`);
  if (input.actor) filters.push(`actor_user_id=eq.${encodeURIComponent(input.actor)}`);
  const data = await rest(`admin_audit_logs?${filters.join("&")}`);
  return Array.isArray(data) ? data : [];
}

export async function getContentAdminModel() {
  const [versions, attempts, resources] = await Promise.all([
    rest("syllabus_versions?select=id,subject_id,version_key,title,status,effective_from,effective_to,source_url,updated_at&order=updated_at.desc&limit=60"),
    rest("exam_attempts?select=id,level_id,label,status,verification_status,start_date,end_date,source_url,updated_at&order=updated_at.desc&limit=60"),
    rest("icai_resources?select=id,resource_type,title,status,verification_status,official_url,published_on,updated_at&order=updated_at.desc&limit=60"),
  ]);
  return { versions: Array.isArray(versions) ? versions : [], attempts: Array.isArray(attempts) ? attempts : [], resources: Array.isArray(resources) ? resources : [] };
}
export function updateContentState(operator: AdminOperator, input: { entityType: "syllabus_version" | "exam_attempt" | "icai_resource"; entityId: string; status: string; verificationStatus?: string }) {
  return rpc("phase12_update_content_state", { p_actor: operator.userId, p_entity_type: input.entityType, p_entity_id: input.entityId, p_status: input.status, p_verification_status: input.verificationStatus || null, p_request_id: crypto.randomUUID() });
}

async function count(path: string) {
  const db = config();
  const response = await fetch(`${db.url}/rest/v1/${path}`, { method: "HEAD", headers: { apikey: db.serviceRoleKey, authorization: `Bearer ${db.serviceRoleKey}`, prefer: "count=exact" }, cache: "no-store" });
  if (!response.ok) return null;
  const total = response.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? Number(total) : null;
}

export async function getOperationsHealth(operator: AdminOperator) {
  const db = config();
  const [members, openReports, pendingResources, failedPayments, syncRows, paymentRows, realtime, billingResponse, authResponse] = await Promise.all([
    count("profiles?select=user_id"),
    count("message_reports?status=eq.open&select=id"),
    count("uploaded_resources?moderation_status=eq.pending&select=id"),
    count("payment_orders?status=eq.failed&select=id"),
    rest("icai_sync_runs?select=status,started_at&order=started_at.desc&limit=1").catch(() => []),
    rest("payment_events?select=provider_status&order=created_at.desc&limit=1").catch(() => []),
    rpc("phase12_realtime_health", { p_actor: operator.userId }).catch(() => false),
    invokeBillingService({ path: "/health", method: "GET" }).catch(() => new Response(null, { status: 503 })),
    fetch(`${db.url}/auth/v1/health`, { headers: { apikey: db.serviceRoleKey }, cache: "no-store" }).catch(() => null),
  ]);
  let storage: HealthState = "ok";
  try { getResourceR2Bucket(); } catch { storage = "not_configured"; }
  const billing = billingResponse.ok ? await billingResponse.json().catch(() => ({})) as { providerConfigured?: boolean; webhookConfigured?: boolean } : {};
  const latestSync = Array.isArray(syncRows) ? syncRows[0] ?? null : null;
  const latestPayment = Array.isArray(paymentRows) ? paymentRows[0] ?? null : null;
  const paymentFailed = (latestPayment as { provider_status?: string } | null)?.provider_status === "failed";
  return {
    counts: { members: members ?? 0, openReports: openReports ?? 0, pendingResources: pendingResources ?? 0, failedPayments: failedPayments ?? 0 },
    checks: {
      database: members === null ? "degraded" : "ok",
      auth: authResponse?.ok ? "ok" : "degraded",
      storage,
      realtime: realtime === true ? "ok" : "degraded",
      razorpay: billingResponse.ok ? (billing.providerConfigured && !paymentFailed ? "ok" : billing.providerConfigured ? "degraded" : "not_configured") : "degraded",
      icai: latestSync ? ((latestSync as { status?: string }).status === "failed" ? "degraded" : "ok") : "not_configured",
    } satisfies Record<string, HealthState>,
    razorpay: billing,
    icai: { latestSync },
    checkedAt: new Date().toISOString(),
  };
}
