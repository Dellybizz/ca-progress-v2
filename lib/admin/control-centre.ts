import "server-only";

import type { AppRole } from "@/lib/authorization/roles";
import type { AdminCapability } from "@/lib/authorization/capabilities.mjs";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { assertNoCriticalConsistencyBlockers } from "@/lib/consistency/scanner";

export const CONTROL_AREAS = [
  { key: "system", label: "System health", href: "/admin/health", capability: "system.configure" },
  { key: "academic", label: "Academic structure", href: "/admin/syllabus", capability: "academic.publish" },
  { key: "attempts", label: "Attempts & exam dates", href: "/admin/icai-sync/data", capability: "academic.publish" },
  { key: "icai", label: "ICAI Sync", href: "/admin/icai-sync", capability: "icai.configure" },
  { key: "resources", label: "Resources & content", href: "/admin/resources/moderation", capability: "resources.configure" },
  { key: "accounts", label: "Students & accounts", href: "/admin/users", capability: "users.profile.correct" },
  { key: "plans", label: "Plans & entitlements", href: "/admin/plans", capability: "billing.plan.configure" },
  { key: "community", label: "Community moderation", href: "/admin/community/moderation", capability: "community.configure" },
  { key: "notifications", label: "Notifications", href: "/admin/notifications", capability: "notifications.manage" },
] as const satisfies ReadonlyArray<{ key: string; label: string; href: string; capability: AdminCapability }>;

export type ControlAreaKey = (typeof CONTROL_AREAS)[number]["key"];

export function controlArea(value: unknown) {
  return CONTROL_AREAS.find((area) => area.key === value) ?? null;
}

function required(value: unknown, label: string, limit: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > limit) throw new Error(`${label} is too long.`);
  return text;
}

function configuration(value: unknown) {
  const raw = required(value, "Configuration", 20_000);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Configuration must be valid JSON."); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Configuration must be a JSON object.");
  return JSON.stringify(parsed);
}

export async function listControlVersions(input: { area?: string; state?: string; query?: string } = {}) {
  const db = getD1RuntimeDatabase();
  const area = controlArea(input.area)?.key ?? "";
  const state = ["draft","published","superseded"].includes(input.state ?? "") ? input.state! : "";
  const query = (input.query ?? "").trim().slice(0,100);
  const result = await db.prepare(`SELECT v.id,v.area_key,v.document_key,v.version,v.title,v.state,v.config_json,v.change_reason,v.created_by,v.created_at,v.published_at,
    CASE WHEN p.version_id=v.id THEN 1 ELSE 0 END AS is_live
    FROM admin_control_versions v LEFT JOIN admin_control_publications p ON p.area_key=v.area_key AND p.document_key=v.document_key
    WHERE (?1='' OR v.area_key=?1) AND (?2='' OR v.state=?2) AND (?3='' OR v.title LIKE ?4 OR v.document_key LIKE ?4)
    ORDER BY v.created_at DESC,v.version DESC LIMIT 120`)
    .bind(area,state,query,`%${query.replaceAll("%","\\%").replaceAll("_","\\_")}%`).all<Record<string,unknown>>();
  return result.results ?? [];
}

export async function getOperatorHealth() {
  const db = getD1RuntimeDatabase();
  const [jobs, dead, reviews, outbox, drafts, users] = await Promise.all([
    db.prepare("SELECT COUNT(*) count FROM background_jobs WHERE status IN ('queued','running')").first<{count:number}>(),
    db.prepare("SELECT COUNT(*) count FROM background_jobs WHERE status IN ('failed','dead_letter')").first<{count:number}>(),
    db.prepare("SELECT COUNT(*) count FROM icai_review_queue WHERE status='pending'").first<{count:number}>(),
    db.prepare("SELECT COUNT(*) count FROM notification_outbox WHERE status='failed'").first<{count:number}>(),
    db.prepare("SELECT COUNT(*) count FROM admin_control_versions WHERE state='draft'").first<{count:number}>(),
    db.prepare("SELECT COUNT(*) count FROM app_users WHERE account_state='active'").first<{count:number}>(),
  ]);
  const n=(row:{count:number}|null)=>Number(row?.count ?? 0);
  return { activeJobs:n(jobs), failedJobs:n(dead), pendingReviews:n(reviews), failedNotifications:n(outbox), drafts:n(drafts), activeUsers:n(users) };
}

type Actor = { userId:string; role:AppRole };
function auditStatement(db:ReturnType<typeof getD1RuntimeDatabase>, input:{ actor:Actor; capability:AdminCapability; action:string; targetId:string; reason:string; previous?:unknown; next?:unknown; reversible:boolean }) {
  return db.prepare(`INSERT INTO admin_audit_events(id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible,created_at)
    VALUES(?1,?2,?3,?4,?5,'admin_control_version',?6,?7,?8,?9,?10,?11,?12)`)
    .bind(crypto.randomUUID(),input.actor.userId,input.actor.role,input.capability,input.action,input.targetId,input.reason,input.previous===undefined?null:JSON.stringify(input.previous),input.next===undefined?null:JSON.stringify(input.next),crypto.randomUUID(),input.reversible?1:0,new Date().toISOString());
}

export async function saveControlDraft(input:{ area:string; documentKey:string; title:string; config:string; reason:string; idempotencyKey:string; actor:Actor }) {
  const area=controlArea(input.area); if(!area) throw new Error("Unknown control area.");
  const key=required(input.documentKey,"Document key",80).toLowerCase().replace(/[^a-z0-9._-]/g,"-");
  const title=required(input.title,"Title",120); const reason=required(input.reason,"Change reason",1000); const config=configuration(input.config);
  const idem=required(input.idempotencyKey,"Request token",120); const db=getD1RuntimeDatabase();
  const prior=await db.prepare("SELECT result_json FROM admin_control_requests WHERE idempotency_key=?1 AND actor_user_id=?2").bind(idem,input.actor.userId).first<{result_json:string}>();
  if(prior) return JSON.parse(prior.result_json);
  const versionRow=await db.prepare("SELECT COALESCE(MAX(version),0)+1 next_version FROM admin_control_versions WHERE area_key=?1 AND document_key=?2").bind(area.key,key).first<{next_version:number}>();
  const version=Number(versionRow?.next_version ?? 1); const id=crypto.randomUUID(); const result={id,area:area.key,key,version,state:"draft"};
  const rows=await db.batch([
    db.prepare("INSERT INTO admin_control_versions(id,area_key,document_key,version,title,state,config_json,change_reason,created_by) VALUES(?1,?2,?3,?4,?5,'draft',?6,?7,?8)").bind(id,area.key,key,version,title,config,reason,input.actor.userId),
    db.prepare("INSERT INTO admin_control_requests(idempotency_key,actor_user_id,action,target_id,result_json) VALUES(?1,?2,'draft',?3,?4)").bind(idem,input.actor.userId,id,JSON.stringify(result)),
    auditStatement(db,{actor:input.actor,capability:area.capability,action:"admin.control.draft",targetId:id,reason,next:result,reversible:true}),
  ]); if(rows.some(row=>row.success===false)) throw new Error("Draft could not be saved atomically."); return result;
}

export async function publishControlVersion(input:{ id:string; reason:string; idempotencyKey:string; actor:Actor }) {
  await assertNoCriticalConsistencyBlockers();
  const db=getD1RuntimeDatabase(); const id=required(input.id,"Version",120); const reason=required(input.reason,"Publish reason",1000); const idem=required(input.idempotencyKey,"Request token",120);
  const version=await db.prepare("SELECT id,area_key,document_key,version,state FROM admin_control_versions WHERE id=?1").bind(id).first<Record<string,unknown>>(); if(!version) throw new Error("Version was not found.");
  const area=controlArea(version.area_key); if(!area) throw new Error("Unknown control area.");
  const prior=await db.prepare("SELECT result_json FROM admin_control_requests WHERE idempotency_key=?1 AND actor_user_id=?2").bind(idem,input.actor.userId).first<{result_json:string}>(); if(prior) return JSON.parse(prior.result_json);
  const current=await db.prepare("SELECT version_id FROM admin_control_publications WHERE area_key=?1 AND document_key=?2").bind(area.key,String(version.document_key)).first<{version_id:string}>();
  const result={id,area:area.key,key:String(version.document_key),version:Number(version.version),state:"published"}; const now=new Date().toISOString();
  const statements=[]; if(current?.version_id && current.version_id!==id) statements.push(db.prepare("UPDATE admin_control_versions SET state='superseded' WHERE id=?1").bind(current.version_id));
  statements.push(db.prepare("UPDATE admin_control_versions SET state='published',published_at=COALESCE(published_at,?1) WHERE id=?2").bind(now,id));
  statements.push(db.prepare(`INSERT INTO admin_control_publications(area_key,document_key,version_id,updated_by,updated_at) VALUES(?1,?2,?3,?4,?5)
    ON CONFLICT(area_key,document_key) DO UPDATE SET version_id=excluded.version_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(area.key,String(version.document_key),id,input.actor.userId,now));
  statements.push(db.prepare("INSERT INTO admin_control_requests(idempotency_key,actor_user_id,action,target_id,result_json) VALUES(?1,?2,'publish',?3,?4)").bind(idem,input.actor.userId,id,JSON.stringify(result)));
  statements.push(auditStatement(db,{actor:input.actor,capability:area.capability,action:current?.version_id?"admin.control.rollback_or_publish":"admin.control.publish",targetId:id,reason,previous:current??null,next:result,reversible:true}));
  const rows=await db.batch(statements); if(rows.some(row=>row.success===false)) throw new Error("Version could not be published atomically."); return result;
}

export async function listPlansAndNotifications() {
  const db=getD1RuntimeDatabase();
  const [plans,templates,outbox]=await Promise.all([
    db.prepare("SELECT id,name,tier_key,billing_cycle,price_subunits,currency,active,checkout_enabled,updated_at FROM subscription_plans ORDER BY sort_order,rank").all<Record<string,unknown>>(),
    db.prepare("SELECT id,template_key,name,title,is_active,updated_at FROM notification_templates ORDER BY name").all<Record<string,unknown>>(),
    db.prepare("SELECT status,COUNT(*) count FROM notification_outbox GROUP BY status").all<Record<string,unknown>>(),
  ]); return {plans:plans.results??[],templates:templates.results??[],outbox:outbox.results??[]};
}
