import "server-only";
import { getAdminRoleForUser } from "@/lib/admin/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { optionalUser, type ServerIdentity } from "@/lib/auth/server";
import { canEnterAdminArea, type AppRole } from "./roles";
const VALID_ROLES = new Set<AppRole>(["student", "moderator", "admin", "owner", "parent_owner"]);
function roleFromClaims(claims: Record<string, unknown> | undefined): AppRole { const appMetadata = claims?.app_metadata; if (!appMetadata || typeof appMetadata !== "object") return "student"; const role = (appMetadata as Record<string, unknown>).role; return typeof role === "string" && VALID_ROLES.has(role as AppRole) ? role as AppRole : "student"; }
export async function getServerAppRole(): Promise<AppRole> { const supabase = await createServerSupabaseClient(); const { data, error } = await supabase.auth.getClaims(); if (error) return "student"; return roleFromClaims(data?.claims as Record<string, unknown> | undefined); }
export async function getAdminOperator(): Promise<{ allowed: boolean; user: ServerIdentity | null; role: AppRole }> {
  const user = await optionalUser();
  if (!user) return { allowed: false, user: null, role: "student" };
  try {
    const freshRole = await getAdminRoleForUser(user.id);
    const role: AppRole = freshRole ?? "student";
    return { allowed: canEnterAdminArea(role), user, role };
  } catch {
    // Compatibility only while the Phase 12 migration is not yet present/configured.
    // Once admin_users is available, a missing/disabled row does not fall back to JWT claims.
    const role = await getServerAppRole();
    return { allowed: canEnterAdminArea(role), user, role };
  }
}
export async function requireAdminOperator() { const operator = await getAdminOperator(); if (!operator.allowed || !operator.user) throw new Error("Access denied: an admin, owner or parent owner role is required."); return { user: operator.user, role: operator.role }; }
