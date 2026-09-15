import "server-only";
import type { AppRole } from "@/lib/authorization/roles";
import type { AdminCapability } from "@/lib/authorization/capabilities.mjs";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export type AdminAuditInput = {
  actorUserId: string;
  actorRole: AppRole;
  capability: AdminCapability;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  traceId?: string | null;
  reversible?: boolean;
};

function encoded(value: unknown) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function bounded(value: string | null | undefined, limit: number) {
  const normalized = value?.trim() || null;
  return normalized && normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

export function adminTraceId(request?: Request) {
  return request?.headers.get("cf-ray")?.trim() || request?.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

export async function recordAdminAuditEvent(input: AdminAuditInput) {
  const id = crypto.randomUUID();
  const db = getD1RuntimeDatabase();
  const result = await db.prepare(`INSERT INTO admin_audit_events(
    id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,
    previous_value,new_value,trace_id,reversible,created_at
  ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
    .bind(
      id,
      input.actorUserId,
      input.actorRole,
      input.capability,
      bounded(input.action, 120),
      bounded(input.targetType, 80),
      bounded(input.targetId, 240),
      bounded(input.reason, 1000),
      encoded(input.previousValue),
      encoded(input.newValue),
      bounded(input.traceId, 160),
      input.reversible ? 1 : 0,
      new Date().toISOString(),
    ).run();
  if (result.success === false) throw new Error("Admin audit event could not be persisted.");
  return id;
}
