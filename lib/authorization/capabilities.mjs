export const ADMIN_CAPABILITIES = Object.freeze([
  "admin.dashboard.read",
  "admin.alerts.read",
  "users.read",
  "users.suspend",
  "users.sessions.revoke",
  "users.onboarding.reset",
  "users.profile.correct",
  "users.feature_override",
  "users.export",
  "users.delete",
  "staff.read",
  "staff.manage",
  "parent_owner.manage",
  "community.read",
  "community.moderate",
  "community.configure",
  "community.verification.manage",
  "resources.read",
  "resources.moderate",
  "resources.configure",
  "storage.read",
  "storage.manage",
  "billing.read",
  "billing.manage",
  "billing.plan.configure",
  "entitlements.override",
  "academic.read",
  "academic.edit",
  "academic.publish",
  "icai.read",
  "icai.run",
  "icai.review",
  "icai.configure",
  "gamification.read",
  "gamification.review",
  "gamification.configure",
  "leaderboard.configure",
  "referrals.configure",
  "rewards.settle",
  "jobs.read",
  "jobs.retry",
  "jobs.cancel",
  "system.read",
  "system.configure",
  "system.recovery",
  "product.features.configure",
  "notifications.manage",
  "content.manage",
  "security.manage",
  "audit.read",
]);

const KNOWN = new Set(ADMIN_CAPABILITIES);
const MODERATOR = new Set([
  "community.read",
  "community.moderate",
  "resources.read",
  "resources.moderate",
  "gamification.read",
  "gamification.review",
]);
const ADMIN = new Set([
  ...MODERATOR,
  "admin.dashboard.read",
  "admin.alerts.read",
  "users.read",
  "staff.read",
  "community.verification.manage",
  "storage.read",
  "billing.read",
  "academic.read",
  "icai.read",
  "icai.run",
  "icai.review",
  "jobs.read",
  "jobs.retry",
  "jobs.cancel",
  "system.read",
  "audit.read",
]);
const OWNER = new Set(ADMIN_CAPABILITIES.filter((capability) => capability !== "parent_owner.manage"));
const PARENT_OWNER = new Set(ADMIN_CAPABILITIES);

const ROLE_CAPABILITIES = Object.freeze({
  student: new Set(),
  moderator: MODERATOR,
  admin: ADMIN,
  owner: OWNER,
  parent_owner: PARENT_OWNER,
});

export function isAdminCapability(value) {
  return typeof value === "string" && KNOWN.has(value);
}

export function capabilitiesForRole(role) {
  return Object.freeze([...(ROLE_CAPABILITIES[role] ?? ROLE_CAPABILITIES.student)]);
}

export function hasAdminCapability(role, capability) {
  return isAdminCapability(capability) && (ROLE_CAPABILITIES[role] ?? ROLE_CAPABILITIES.student).has(capability);
}

export function hasAnyAdminCapability(role) {
  return (ROLE_CAPABILITIES[role] ?? ROLE_CAPABILITIES.student).size > 0;
}
