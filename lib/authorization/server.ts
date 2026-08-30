import "server-only";
import { getAdminRoleForUser } from "@/lib/admin/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { optionalUser, type ServerIdentity } from "@/lib/auth/server";
import { canEnterAdminArea, type AppRole } from "./roles";
const VALID_ROLES = new Set<AppRole>(["student", "moderator", "admin", "owner", "parent_owner"]);
function roleFromClaims(claims: Record<string, unknown> | undefined): AppRole { const appMetadata = claims?.app_metadata; if (!appMetadata || typeof appMetadata !== "object") return "student"; const role = (appMetadata as Record<string, unknown>).role; return typeof role === "string" && VALID_ROLES.has(role as AppRole) ? role as AppRole : "student"; }
export async function getServerAppRole(): Promise<AppRole> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) return "student";
  const claims = data?.claims as Record<string, unknown> | undefined;
  const claimedRole = roleFromClaims(claims);
  const userId = typeof claims?.sub === "string" ? claims.sub : "";
  if (!userId) return "student";
  try {
    const freshRole = await getAdminRoleForUser(userId);
    return freshRole ?? "student";
  } catch {
    // Compatibility only before the Phase 12 migration/server credential is available.
    return claimedRole;
  }
}
export async function getAdminOperator(): Promise<{ allowed: boolean; user: ServerIdentity | null; role: AppRole }> {
  const user = await optionalUser();
  if (!user) return { allowed: false, user: null, role: "student" };
  const role = await getServerAppRole();
  return { allowed: canEnterAdminArea(role), user, role };
}
export async function requireAdminOperator() { const operator = await getAdminOperator(); if (!operator.allowed || !operator.user) throw new Error("Access denied: an admin, owner or parent owner role is required."); return { user: operator.user, role: operator.role }; }
