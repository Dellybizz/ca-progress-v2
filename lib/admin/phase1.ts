import "server-only";

import type { AppRole } from "@/lib/authorization/roles";
import type { AdminCapability } from "@/lib/authorization/capabilities.mjs";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export type AdminUserRow = {
  userId: string;
  displayName: string | null;
  email: string | null;
  role: AppRole;
  accountState: string;
  caLevel: string | null;
  groupChoice: string | null;
  attemptKey: string | null;
  planName: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type AdminAuditRow = {
  id: string;
  actorUserId: string;
  actorRole: AppRole;
  capability: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  previousValue: string | null;
  newValue: string | null;
  traceId: string | null;
  reversible: boolean;
  createdAt: string;
};

export type AdminCommandCenterMetrics = {
  users: number;
  activeUsers: number;
  disabledUsers: number;
  staff: number;
  pendingIcaiReviews: number;
  failedJobs: number;
  auditEvents24h: number;
};

const APP_ROLES = new Set<AppRole>(["student", "moderator", "admin", "owner", "parent_owner"]);
const STAFF_ROLES = new Set<AppRole>(["moderator", "admin", "owner", "parent_owner"]);
const USER_PAGE_SIZE = 40;

function appRole(value: unknown): AppRole {
  return typeof value === "string" && APP_ROLES.has(value as AppRole) ? value as AppRole : "student";
}

function cleanQuery(value: string | undefined, limit = 100) {
  return (value ?? "").trim().slice(0, limit);
}

function likePattern(value: string) {
  return `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function positivePage(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(1, Math.min(250, Math.floor(value!))) : 1;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const USER_SELECT = `
  SELECT
    u.user_id,
    u.role,
    u.account_state,
    u.created_at,
    p.display_name,
    p.ca_level,
    p.group_choice,
    p.attempt_key,
    (SELECT ai.email FROM auth_identities ai WHERE ai.application_user_id=u.user_id ORDER BY COALESCE(ai.last_seen_at,ai.updated_at) DESC LIMIT 1) AS email,
    (SELECT ai.last_seen_at FROM auth_identities ai WHERE ai.application_user_id=u.user_id ORDER BY COALESCE(ai.last_seen_at,ai.updated_at) DESC LIMIT 1) AS last_seen_at,
    (SELECT sp.name FROM user_subscriptions us JOIN subscription_plans sp ON sp.id=us.plan_id
      WHERE us.user_id=u.user_id AND us.status IN ('active','paused')
        AND (us.ends_at IS NULL OR us.ends_at>CURRENT_TIMESTAMP)
      ORDER BY CASE us.status WHEN 'active' THEN 0 ELSE 1 END, COALESCE(us.ends_at,'9999-12-31') DESC, us.updated_at DESC LIMIT 1) AS plan_name
  FROM app_users u
  LEFT JOIN profiles p ON p.user_id=u.user_id`;

function mapUser(row: Record<string, unknown>): AdminUserRow {
  return {
    userId: String(row.user_id),
    displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name : null,
    email: typeof row.email === "string" && row.email.trim() ? row.email : null,
    role: appRole(row.role),
    accountState: typeof row.account_state === "string" ? row.account_state : "active",
    caLevel: typeof row.ca_level === "string" ? row.ca_level : null,
    groupChoice: typeof row.group_choice === "string" ? row.group_choice : null,
    attemptKey: typeof row.attempt_key === "string" ? row.attempt_key : null,
    planName: typeof row.plan_name === "string" ? row.plan_name : null,
    lastSeenAt: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function getAdminCommandCenterMetrics(): Promise<AdminCommandCenterMetrics> {
  const db = getD1RuntimeDatabase();
  const [users, activeUsers, disabledUsers, staff, reviews, failedJobs, auditEvents] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM app_users").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM app_users WHERE account_state='active'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM app_users WHERE account_state='disabled'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role IN ('moderator','admin','owner','parent_owner') AND account_state='active'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM icai_review_queue WHERE status='pending'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM background_jobs WHERE status IN ('failed','dead_letter')").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM admin_audit_events WHERE created_at>=datetime('now','-1 day')").first<{ count: number }>(),
  ]);
  return {
    users: numberValue(users?.count),
    activeUsers: numberValue(activeUsers?.count),
    disabledUsers: numberValue(disabledUsers?.count),
    staff: numberValue(staff?.count),
    pendingIcaiReviews: numberValue(reviews?.count),
    failedJobs: numberValue(failedJobs?.count),
    auditEvents24h: numberValue(auditEvents?.count),
  };
}

export async function searchAdminUsers(input: { query?: string; page?: number } = {}) {
  const db = getD1RuntimeDatabase();
  const query = cleanQuery(input.query);
  const page = positivePage(input.page);
  const offset = (page - 1) * USER_PAGE_SIZE;
  const where = query
    ? `WHERE u.user_id LIKE ?1 ESCAPE '\\'
      OR COALESCE(p.display_name,'') LIKE ?1 ESCAPE '\\'
      OR EXISTS(SELECT 1 FROM auth_identities search_ai WHERE search_ai.application_user_id=u.user_id AND (COALESCE(search_ai.email,'') LIKE ?1 ESCAPE '\\' OR COALESCE(search_ai.display_name,'') LIKE ?1 ESCAPE '\\'))`
    : "";
  const pattern = likePattern(query);
  const rowsStatement = db.prepare(`${USER_SELECT} ${where} ORDER BY COALESCE(last_seen_at,u.created_at) DESC, u.user_id LIMIT ?${query ? 2 : 1} OFFSET ?${query ? 3 : 2}`);
  const countStatement = db.prepare(`SELECT COUNT(*) AS count FROM app_users u LEFT JOIN profiles p ON p.user_id=u.user_id ${where}`);
  const rowsResult = query
    ? await rowsStatement.bind(pattern, USER_PAGE_SIZE, offset).all<Record<string, unknown>>()
    : await rowsStatement.bind(USER_PAGE_SIZE, offset).all<Record<string, unknown>>();
  const countResult = query
    ? await countStatement.bind(pattern).first<{ count: number }>()
    : await countStatement.first<{ count: number }>();
  const total = numberValue(countResult?.count);
  return {
    query,
    page,
    pageSize: USER_PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / USER_PAGE_SIZE)),
    users: (rowsResult.results ?? []).map(mapUser),
  };
}

export async function listAdminStaff() {
  const db = getD1RuntimeDatabase();
  const result = await db.prepare(`${USER_SELECT} WHERE u.role IN ('moderator','admin','owner','parent_owner') ORDER BY CASE u.role WHEN 'parent_owner' THEN 0 WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, COALESCE(p.display_name,u.user_id) LIMIT 150`).all<Record<string, unknown>>();
  return (result.results ?? []).map(mapUser);
}

export async function getAdminUserById(userId: string) {
  const db = getD1RuntimeDatabase();
  const row = await db.prepare(`${USER_SELECT} WHERE u.user_id=?1 LIMIT 1`).bind(userId).first<Record<string, unknown>>();
  return row ? mapUser(row) : null;
}

export async function changeStaffRoleWithAudit(input: {
  actorUserId: string;
  actorRole: AppRole;
  targetUserId: string;
  nextRole: AppRole;
  reason: string;
  traceId: string;
}) {
  const db = getD1RuntimeDatabase();
  if (!STAFF_ROLES.has(input.actorRole)) throw new Error("Staff management requires an owner role.");
  if (input.actorRole !== "owner" && input.actorRole !== "parent_owner") throw new Error("Staff management requires an owner role.");
  if (!APP_ROLES.has(input.nextRole)) throw new Error("Unknown staff role.");
  if (input.actorUserId === input.targetUserId) throw new Error("Self role changes are blocked. Use another Parent Owner for ownership changes.");
  const current = await db.prepare("SELECT user_id,role,account_state FROM app_users WHERE user_id=?1 LIMIT 1").bind(input.targetUserId).first<{ user_id: string; role: string; account_state: string }>();
  if (!current) throw new Error("User was not found.");
  const currentRole = appRole(current.role);
  if (currentRole === "parent_owner" && input.actorRole !== "parent_owner") throw new Error("Only a Parent Owner can change another Parent Owner.");
  if (input.nextRole === "parent_owner" && input.actorRole !== "parent_owner") throw new Error("Only a Parent Owner can grant Parent Owner.");
  if (currentRole === input.nextRole) return { changed: false, previousRole: currentRole, nextRole: input.nextRole };
  const reason = cleanQuery(input.reason, 1000);
  if (reason.length < 3) throw new Error("A reason is required for staff role changes.");
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const capability: AdminCapability = input.nextRole === "parent_owner" || currentRole === "parent_owner" ? "parent_owner.manage" : "staff.manage";
  const results = await db.batch([
    db.prepare("UPDATE app_users SET role=?1,updated_at=?2 WHERE user_id=?3 AND role=?4").bind(input.nextRole, now, input.targetUserId, currentRole),
    db.prepare(`INSERT INTO admin_audit_events(
      id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible,created_at
    ) VALUES(?1,?2,?3,?4,'staff.role.change','user',?5,?6,?7,?8,?9,1,?10)`)
      .bind(auditId, input.actorUserId, input.actorRole, capability, input.targetUserId, reason, JSON.stringify({ role: currentRole }), JSON.stringify({ role: input.nextRole }), input.traceId, now),
  ]);
  if (results.some((result) => result.success === false)) throw new Error("Staff role change could not be committed atomically.");
  return { changed: true, previousRole: currentRole, nextRole: input.nextRole, auditId };
}

export async function listAdminAudit(input: { query?: string; limit?: number } = {}) {
  const db = getD1RuntimeDatabase();
  const query = cleanQuery(input.query);
  const limit = Math.max(20, Math.min(150, Math.floor(input.limit ?? 80)));
  const where = query
    ? `WHERE actor_user_id LIKE ?1 ESCAPE '\\' OR capability LIKE ?1 ESCAPE '\\' OR action LIKE ?1 ESCAPE '\\' OR target_type LIKE ?1 ESCAPE '\\' OR COALESCE(target_id,'') LIKE ?1 ESCAPE '\\'`
    : "";
  const statement = db.prepare(`SELECT id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible,created_at FROM admin_audit_events ${where} ORDER BY created_at DESC,id DESC LIMIT ?${query ? 2 : 1}`);
  const result = query
    ? await statement.bind(likePattern(query), limit).all<Record<string, unknown>>()
    : await statement.bind(limit).all<Record<string, unknown>>();
  return (result.results ?? []).map((row): AdminAuditRow => ({
    id: String(row.id),
    actorUserId: String(row.actor_user_id),
    actorRole: appRole(row.actor_role),
    capability: String(row.capability),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: typeof row.target_id === "string" ? row.target_id : null,
    reason: typeof row.reason === "string" ? row.reason : null,
    previousValue: typeof row.previous_value === "string" ? row.previous_value : null,
    newValue: typeof row.new_value === "string" ? row.new_value : null,
    traceId: typeof row.trace_id === "string" ? row.trace_id : null,
    reversible: Number(row.reversible) === 1,
    createdAt: String(row.created_at),
  }));
}
