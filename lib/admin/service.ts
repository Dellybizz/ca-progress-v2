import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { optionalUser } from "@/lib/auth/server";
import { type AdminOperator, type AdminRole } from "@/lib/admin/authorization";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

export { canManageOperations, canManagePlatform, canManageRoles, getAdminRoleForUser, requireAdminOperator } from "@/lib/admin/authorization";
export type { AdminOperator, AdminRole } from "@/lib/admin/authorization";
export type HealthState = "ok" | "degraded" | "not_configured";

type AdminOpsService = { fetch(request: Request): Promise<Response> };

type AdminInvoke = {
  path: "/members" | "/platform" | "/plans" | "/notifications" | "/audit" | "/content" | "/health";
  method?: "GET" | "POST" | "PATCH";
  operator?: AdminOperator;
  query?: URLSearchParams;
  body?: unknown;
};

function binding(): AdminOpsService | null {
  try {
    const { env } = getCloudflareContext();
    const value = (env as unknown as Record<string, unknown>).ADMIN_OPS_SERVICE;
    return value && typeof (value as AdminOpsService).fetch === "function" ? value as AdminOpsService : null;
  } catch {
    return null;
  }
}

async function currentUserId(operator?: AdminOperator) {
  if (operator?.userId) return operator.userId;
  const identity = await optionalUser();
  if (!identity) throw new Error("ADMIN_AUTH_REQUIRED");
  return identity.id;
}

async function invokeAdminOps(input: AdminInvoke): Promise<unknown> {
  const service = binding();
  if (!service) throw new Error("Admin operations service is not connected in this environment yet.");
  const db = getSupabaseAdminRuntimeConfig();
  if (!db.configured) throw new Error("V2 admin database configuration is unavailable.");
  const userId = await currentUserId(input.operator);
  const headers = new Headers({
    "x-ca-progress-internal": "ca-progress-v2-web",
    "x-ca-progress-supabase-url": db.url,
    "x-ca-progress-service-role": db.serviceRoleKey,
    "x-ca-progress-user-id": userId,
    "accept": "application/json",
  });
  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }
  const query = input.query?.toString();
  const response = await service.fetch(new Request(`https://admin-ops.internal${input.path}${query ? `?${query}` : ""}`, {
    method: input.method ?? "GET",
    headers,
    body,
  }));
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { error: text }; }
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
      ? String((data as { error: string }).error)
      : `Admin operations service failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

export type MemberRow = {
  user_id: string; email: string | null; display_name: string; role: string; admin_active: boolean;
  plan_tier: string; plan_name: string; subscription_ends_at: string | null; user_created_at: string; total_count: number;
};

export async function listMembers(operator: AdminOperator, input: { page: number; limit: number; search?: string; role?: string }) {
  const query = new URLSearchParams({ page: String(input.page), limit: String(input.limit) });
  if (input.search?.trim()) query.set("q", input.search.trim());
  if (input.role?.trim()) query.set("role", input.role.trim());
  return await invokeAdminOps({ path: "/members", operator, query }) as { rows: MemberRow[]; total: number; page: number; limit: number };
}

export function setMemberRole(operator: AdminOperator, targetUserId: string, role: AdminRole) {
  return invokeAdminOps({ path: "/members", method: "PATCH", operator, body: { action: "role", userId: targetUserId, role } });
}
export function setMemberAdminActive(operator: AdminOperator, targetUserId: string, active: boolean) {
  return invokeAdminOps({ path: "/members", method: "PATCH", operator, body: { action: "active", userId: targetUserId, active } });
}

export async function getPlatformModel() {
  return await invokeAdminOps({ path: "/platform" }) as { flags: unknown[]; maintenance: unknown };
}
export function setFeatureFlag(operator: AdminOperator, flagKey: string, enabled: boolean) {
  return invokeAdminOps({ path: "/platform", method: "PATCH", operator, body: { action: "feature", flagKey, enabled } });
}
export function setMaintenance(operator: AdminOperator, input: { enabled: boolean; message: string; startsAt?: string | null; endsAt?: string | null }) {
  return invokeAdminOps({ path: "/platform", method: "PATCH", operator, body: { action: "maintenance", ...input } });
}

export async function getPlansAdminModel() {
  return await invokeAdminOps({ path: "/plans" }) as { plans: unknown[]; entitlements: unknown[] };
}
export function updatePlan(operator: AdminOperator, input: { planId: string; priceSubunits: number | null; checkoutEnabled: boolean; active: boolean }) {
  return invokeAdminOps({ path: "/plans", method: "PATCH", operator, body: { action: "plan", ...input } });
}
export function updateEntitlement(operator: AdminOperator, input: { planId: string; featureKey: string; enabled: boolean; limitValue: number | null; limitUnit: string; upgradeMessage: string }) {
  return invokeAdminOps({ path: "/plans", method: "PATCH", operator, body: { action: "entitlement", ...input } });
}

export async function getNotificationTemplates() {
  const data = await invokeAdminOps({ path: "/notifications" }) as { templates?: unknown[] };
  return Array.isArray(data?.templates) ? data.templates : [];
}
export function saveNotificationTemplate(operator: AdminOperator, input: { id?: string | null; templateKey: string; name: string; title: string; body: string; active: boolean }) {
  return invokeAdminOps({ path: "/notifications", method: "POST", operator, body: input });
}

export async function getAuditLog(input: { page: number; limit: number; action?: string; actor?: string }) {
  const query = new URLSearchParams({ page: String(input.page), limit: String(input.limit) });
  if (input.action?.trim()) query.set("action", input.action.trim());
  if (input.actor?.trim()) query.set("actor", input.actor.trim());
  const data = await invokeAdminOps({ path: "/audit", query }) as { rows?: unknown[] };
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function getContentAdminModel() {
  return await invokeAdminOps({ path: "/content" }) as { versions: unknown[]; attempts: unknown[]; resources: unknown[] };
}
export function updateContentState(operator: AdminOperator, input: { entityType: "syllabus_version" | "exam_attempt" | "icai_resource"; entityId: string; status: string; verificationStatus?: string }) {
  return invokeAdminOps({ path: "/content", method: "PATCH", operator, body: input });
}

export type OperationsHealth = {
  counts: { members: number; openReports: number; pendingResources: number; failedPayments: number };
  checks: Record<string, HealthState>;
  razorpay: { providerConfigured?: boolean; webhookConfigured?: boolean };
  icai: { latestSync: unknown };
  checkedAt: string;
};

export async function getOperationsHealth(operator: AdminOperator) {
  return await invokeAdminOps({ path: "/health", operator }) as OperationsHealth;
}
