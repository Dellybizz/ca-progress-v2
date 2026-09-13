import "server-only";
import { redirect } from "next/navigation";
import { getRequestAuthContext, optionalUser, type ServerIdentity } from "@/lib/auth/server";
import { canEnterAdminArea, type AppRole } from "./roles";
import { hasAdminCapability, hasAnyAdminCapability, type AdminCapability } from "./capabilities.mjs";

const VALID_ROLES = new Set<AppRole>(["student", "moderator", "admin", "owner", "parent_owner"]);

export class AdminAuthorizationError extends Error {
  readonly status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AdminAuthorizationError";
    this.status = status;
  }
}

export type AdminActor = { user: ServerIdentity; role: AppRole };

export async function getServerAppRole(): Promise<AppRole> {
  const auth = await getRequestAuthContext();
  return VALID_ROLES.has(auth.role) ? auth.role : "student";
}

export async function getAdminActor(): Promise<AdminActor | null> {
  const auth = await getRequestAuthContext();
  if (!auth.identity) return null;
  const role = VALID_ROLES.has(auth.role) ? auth.role : "student";
  return { user: auth.identity, role };
}

export async function getAdminAreaAccess(): Promise<{ allowed: boolean; user: ServerIdentity | null; role: AppRole }> {
  const actor = await getAdminActor();
  if (!actor) return { allowed: false, user: null, role: "student" };
  return { allowed: hasAnyAdminCapability(actor.role), user: actor.user, role: actor.role };
}

export async function requireAdminAreaAccess(): Promise<AdminActor> {
  const actor = await getAdminActor();
  if (!actor) throw new AdminAuthorizationError("Authentication required.", 401);
  if (!hasAnyAdminCapability(actor.role)) throw new AdminAuthorizationError("Admin capability required.", 403);
  return actor;
}

export async function requireAdminCapability(capability: AdminCapability): Promise<AdminActor> {
  const actor = await getAdminActor();
  if (!actor) throw new AdminAuthorizationError("Authentication required.", 401);
  if (!hasAdminCapability(actor.role, capability)) throw new AdminAuthorizationError(`Missing admin capability: ${capability}.`, 403);
  return actor;
}

export function adminAuthorizationStatus(error: unknown): 401 | 403 | null {
  return error instanceof AdminAuthorizationError ? error.status : null;
}

export async function requireAdminAreaPageAccess(): Promise<AdminActor> {
  const actor = await getAdminActor();
  if (!actor) redirect("/login?next=%2Fadmin");
  if (!hasAnyAdminCapability(actor.role)) redirect("/dashboard");
  return actor;
}

export async function requireAdminPageCapability(capability: AdminCapability): Promise<AdminActor> {
  const actor = await requireAdminAreaPageAccess();
  if (hasAdminCapability(actor.role, capability)) return actor;
  if (actor.role === "moderator") redirect("/admin/community/moderation");
  redirect("/admin");
}

// Backwards-compatible operator helpers. New admin code should require a named capability.
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
