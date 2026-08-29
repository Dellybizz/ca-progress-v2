export type AppRole = "student" | "moderator" | "admin" | "owner" | "parent_owner";

const privileged = new Set<AppRole>(["moderator", "admin", "owner", "parent_owner"]);

export function isPrivilegedRole(role: AppRole) {
  return privileged.has(role);
}

export function canEnterAdminArea(role: AppRole) {
  return role === "admin" || role === "owner" || role === "parent_owner";
}
