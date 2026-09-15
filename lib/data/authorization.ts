import type { AppRole } from "@/lib/authorization/roles";

export type TrustedSessionActor = {
  kind: "user";
  userId: string;
  role: AppRole;
  source: "trusted-session";
  entitlementKeys?: readonly string[];
};

export type TrustedServiceActor = {
  kind: "service";
  service: "web" | "billing" | "icai-sync" | "system" | "mentor";
  source: "service-binding";
};

export type TrustedActor = TrustedSessionActor | TrustedServiceActor;

export type AuthorizationAction =
  | "public-read"
  | "own-read"
  | "own-write"
  | "moderate"
  | "admin-read"
  | "admin-write"
  | "owner-write"
  | "entitled"
  | "service-only";

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function trustedUserActor(userId: string, role: AppRole, entitlementKeys?: readonly string[]): TrustedSessionActor {
  if (!userId) throw new AuthorizationError("Trusted session is missing a user identity");
  return { kind: "user", userId, role, source: "trusted-session", entitlementKeys };
}

export function trustedServiceActor(service: TrustedServiceActor["service"]): TrustedServiceActor {
  return { kind: "service", service, source: "service-binding" };
}

export function requireUser(actor: TrustedActor): asserts actor is TrustedSessionActor {
  if (actor.kind !== "user" || actor.source !== "trusted-session") {
    throw new AuthorizationError("A trusted authenticated session is required");
  }
}

export function requireOwnership(actor: TrustedActor, persistedOwnerUserId: string): void {
  requireUser(actor);
  if (actor.userId !== persistedOwnerUserId) throw new AuthorizationError("Resource is owned by another user");
}

export function requireModerator(actor: TrustedActor): void {
  requireUser(actor);
  if (!["moderator", "admin", "owner", "parent_owner"].includes(actor.role)) {
    throw new AuthorizationError("Moderator access is required");
  }
}

export function requireAdmin(actor: TrustedActor): void {
  requireUser(actor);
  if (!["admin", "owner", "parent_owner"].includes(actor.role)) {
    throw new AuthorizationError("Admin access is required");
  }
}

export function requireOwner(actor: TrustedActor): void {
  requireUser(actor);
  if (!["owner", "parent_owner"].includes(actor.role)) {
    throw new AuthorizationError("Owner access is required");
  }
}

export function requireParentOwner(actor: TrustedActor): void {
  requireUser(actor);
  if (actor.role !== "parent_owner") throw new AuthorizationError("Parent owner access is required");
}

export function requireEntitlement(actor: TrustedActor, featureKey: string): void {
  requireUser(actor);
  if (!actor.entitlementKeys?.includes(featureKey)) {
    throw new AuthorizationError(`Entitlement ${featureKey} is required`);
  }
}

export function requireService(actor: TrustedActor, allowed?: readonly TrustedServiceActor["service"][]): void {
  if (actor.kind !== "service" || actor.source !== "service-binding") {
    throw new AuthorizationError("Internal service authentication is required");
  }
  if (allowed && !allowed.includes(actor.service)) {
    throw new AuthorizationError(`Service ${actor.service} is not allowed for this operation`);
  }
}

export const PHASE_2_AUTHORIZATION_MATRIX = {
  publicCatalog: { read: "public-read", write: "service-only" },
  ownProfile: { read: "own-read", write: "own-write" },
  ownPreferences: { read: "own-read", write: "own-write" },
  ownProgress: { read: "own-read", write: "own-write" },
  ownPlanner: { read: "own-read", write: "own-write" },
  ownStudy: { read: "own-read", write: "own-write" },
  ownNotesResources: { read: "own-read", write: "own-write" },
  community: { read: "public-read", write: "own-write", moderate: "moderate" },
  subscriptions: { read: "own-read", write: "service-only" },
  billing: { read: "own-read", write: "service-only" },
  icai: { read: "public-read", write: "service-only" },
  appSettings: { publicRead: "public-read", privateRead: "admin-read", write: "admin-write" },
  mentorPublished: { read: "public-read", write: "service-only" },
  mentorPersonalization: { read: "own-read", write: "service-only" },
} as const satisfies Record<string, Record<string, AuthorizationAction>>;

// The target user/owner is always loaded from a trusted route/session or from the
// persisted row. A request body/query userId is never accepted as the actor.
export function assertNoBrowserSuppliedActorId(actor: TrustedActor, browserSuppliedUserId?: string | null): void {
  if (!browserSuppliedUserId || actor.kind !== "user") return;
  if (browserSuppliedUserId !== actor.userId) {
    throw new AuthorizationError("Browser-supplied user identity cannot authorize this request");
  }
}
