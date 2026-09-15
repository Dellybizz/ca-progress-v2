import type { AppRole } from "./roles";

export const ADMIN_CAPABILITIES: readonly [
  "admin.dashboard.read", "admin.alerts.read", "users.read", "users.suspend", "users.sessions.revoke",
  "users.onboarding.reset", "users.profile.correct", "users.feature_override", "users.export", "users.delete",
  "staff.read", "staff.manage", "parent_owner.manage", "community.read", "community.moderate", "community.configure",
  "community.verification.manage", "resources.read", "resources.moderate", "resources.configure", "storage.read",
  "storage.manage", "billing.read", "billing.manage", "billing.plan.configure", "entitlements.override", "academic.read",
  "academic.edit", "academic.publish", "icai.read", "icai.run", "icai.review", "icai.configure", "gamification.read",
  "gamification.review", "gamification.configure", "leaderboard.configure", "referrals.configure", "rewards.settle",
  "jobs.read", "jobs.retry", "jobs.cancel", "system.read", "system.configure", "system.recovery",
  "product.features.configure", "notifications.manage", "content.manage", "security.manage", "audit.read"
];
export type AdminCapability = typeof ADMIN_CAPABILITIES[number];
export function isAdminCapability(value: unknown): value is AdminCapability;
export function capabilitiesForRole(role: AppRole): readonly AdminCapability[];
export function hasAdminCapability(role: AppRole, capability: AdminCapability): boolean;
export function hasAnyAdminCapability(role: AppRole): boolean;
