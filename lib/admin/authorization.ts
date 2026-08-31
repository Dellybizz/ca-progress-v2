import "server-only";

import { optionalUser } from "@/lib/auth/server";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

export type AdminRole = "moderator" | "admin" | "owner" | "parent_owner";
export type AdminOperator = { userId: string; role: AdminRole };

const roleRank: Record<AdminRole, number> = { moderator: 10, admin: 20, owner: 30, parent_owner: 40 };
const validRoles = new Set<AdminRole>(Object.keys(roleRank) as AdminRole[]);

async function adminRest(path: string) {
  const db = getSupabaseAdminRuntimeConfig();
  if (!db.configured) throw new Error("V2 admin database configuration is unavailable.");
  const response = await fetch(`${db.url}/rest/v1/${path}`, {
    headers: { apikey: db.serviceRoleKey, authorization: `Bearer ${db.serviceRoleKey}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Admin lookup failed (${response.status}).`);
  return await response.json() as unknown;
}

export async function getAdminRoleForUser(userId: string): Promise<AdminRole | null> {
  const data = await adminRest(`admin_users?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=role&limit=1`);
  const role = Array.isArray(data) && data[0] && typeof (data[0] as { role?: unknown }).role === "string" ? String((data[0] as { role: string }).role) : "";
  return validRoles.has(role as AdminRole) ? role as AdminRole : null;
}

export async function getActiveOwnerCount() {
  const data = await adminRest("admin_users?is_active=eq.true&role=in.(owner,parent_owner)&select=user_id");
  if (!Array.isArray(data)) throw new Error("OWNER_GOVERNANCE_LOOKUP_FAILED");
  return data.length;
}

export async function requireAdminOperator(minimum: AdminRole = "moderator"): Promise<AdminOperator> {
  const identity = await optionalUser();
  if (!identity) throw new Error("ADMIN_AUTH_REQUIRED");
  const role = await getAdminRoleForUser(identity.id);
  if (!role || roleRank[role] < roleRank[minimum]) throw new Error("ADMIN_ACCESS_DENIED");
  return { userId: identity.id, role };
}

export function canManageRoles(role: AdminRole) { return roleRank[role] >= roleRank.owner; }
export function canManagePlatform(role: AdminRole) { return roleRank[role] >= roleRank.owner; }
export function canManageOperations(role: AdminRole) { return roleRank[role] >= roleRank.admin; }
