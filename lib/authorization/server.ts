import "server-only";
import { getRequestAuthContext, optionalUser, type ServerIdentity } from "@/lib/auth/server";
import { canEnterAdminArea, type AppRole } from "./roles";

const VALID_ROLES = new Set<AppRole>(["student", "moderator", "admin", "owner", "parent_owner"]);

export async function getServerAppRole(): Promise<AppRole> {
  const auth = await getRequestAuthContext();
  return VALID_ROLES.has(auth.role) ? auth.role : "student";
}

export async function getAdminOperator(): Promise<{ allowed: boolean; user: ServerIdentity | null; role: AppRole }> {
  const user = await optionalUser();
  if (!user) return { allowed: false, user: null, role: "student" };
  const role = (await getRequestAuthContext()).role;
  return { allowed: canEnterAdminArea(role), user, role };
}

export async function requireAdminOperator() {
  const operator = await getAdminOperator();
  if (!operator.allowed || !operator.user) throw new Error("Access denied: an admin, owner or parent owner role is required.");
  return { allowed: true, user: operator.user, role: operator.role };
}
