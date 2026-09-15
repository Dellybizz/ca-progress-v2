import "server-only";

import type { AppRole } from "@/lib/authorization/roles";
import { invalidateUserFeatureCache } from "@/lib/cache/public";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

type Actor = { userId: string; role: AppRole };
type Row = Record<string, unknown>;

export type AccessSource = {
  id: string;
  kind: "paid" | "paid_through" | "promotion" | "reward" | "manual" | "override" | "free";
  label: string;
  planName: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  detail: string;
};

export type ManualGrant = {
  id: string; subscriptionId: string; planId: string; planName: string; state: string;
  startsAt: string; endsAt: string | null; reason: string; createdBy: string;
  createdAt: string; updatedAt: string; revokedAt: string | null; revokeReason: string | null;
};

function text(value: string, label: string, limit = 1000) {
  const result = value.trim();
  if (!result || result.length > limit) throw new Error(`${label} is invalid.`);
  return result;
}

function reason(value: string) {
  const result = text(value, "Reason", 1000);
  if (result.length < 8) throw new Error("Give a reason of at least 8 characters.");
  return result;
}

function instant(value: string, label: string) {
  const timestamp = new Date(text(value, label, 80));
  if (Number.isNaN(timestamp.getTime())) throw new Error(`${label} is invalid.`);
  return timestamp.toISOString();
}

function audit(db: ReturnType<typeof getD1RuntimeDatabase>, actor: Actor, action: string, targetId: string, why: string, previousValue: unknown, newValue: unknown) {
  return db.prepare(`INSERT INTO admin_audit_events(
    id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,
    previous_value,new_value,trace_id,reversible,created_at
  ) VALUES(?1,?2,?3,'billing.manage',?4,'admin_subscription_grant',?5,?6,?7,?8,?9,1,?10)`)
    .bind(crypto.randomUUID(), actor.userId, actor.role, action, targetId, why,
      previousValue === undefined ? null : JSON.stringify(previousValue),
      newValue === undefined ? null : JSON.stringify(newValue), crypto.randomUUID(), new Date().toISOString());
}

export async function listGrantablePlans() {
  const db = getD1RuntimeDatabase();
  const result = await db.prepare(`SELECT sp.id,sp.name,sp.tier_key,sp.billing_cycle,sp.duration_value,sp.duration_unit
    FROM subscription_plans sp JOIN plan_policy_publications ppp ON ppp.plan_id=sp.id
    WHERE sp.active=1 AND sp.tier_key<>'free' ORDER BY sp.rank,sp.sort_order,sp.name`).all<Row>();
  return result.results ?? [];
}

export async function getUserSubscriptionAccess(userId: string) {
  const db = getD1RuntimeDatabase();
  const [subscriptions, promotions, rewards, overrides, grants, events, payments] = await Promise.all([
    db.prepare(`SELECT us.id,us.plan_id,sp.name AS plan_name,us.status,us.source,us.starts_at,us.ends_at,us.created_at,us.updated_at
      FROM user_subscriptions us JOIN subscription_plans sp ON sp.id=us.plan_id WHERE us.user_id=?1
      ORDER BY us.starts_at DESC,us.created_at DESC LIMIT 40`).bind(userId).all<Row>(),
    db.prepare(`SELECT pp.id,pp.name,sp.name AS plan_name,pp.starts_at,pp.ends_at,pp.active
      FROM plan_promotion_grants ppg JOIN plan_promotions pp ON pp.id=ppg.promotion_id
      JOIN plan_policy_versions pv ON pv.id=pp.policy_version_id JOIN subscription_plans sp ON sp.id=pv.plan_id
      WHERE ppg.user_id=?1 ORDER BY pp.starts_at DESC LIMIT 30`).bind(userId).all<Row>(),
    db.prepare(`SELECT lrg.id,lrg.status,lrg.reward_tier,sp.name AS plan_name,lrg.starts_at,lrg.ends_at,lrg.rank
      FROM leaderboard_reward_grants lrg JOIN subscription_plans sp ON sp.id=lrg.plan_id
      WHERE lrg.user_id=?1 ORDER BY lrg.starts_at DESC LIMIT 30`).bind(userId).all<Row>(),
    db.prepare(`SELECT id,feature_key,enabled,quantity_limit,expires_at,reason,created_at,revoked_at
      FROM entitlement_overrides WHERE user_id=?1 ORDER BY created_at DESC LIMIT 40`).bind(userId).all<Row>(),
    db.prepare(`SELECT g.*,sp.name AS plan_name FROM admin_subscription_grants g
      JOIN subscription_plans sp ON sp.id=g.plan_id WHERE g.user_id=?1 ORDER BY g.created_at DESC LIMIT 40`).bind(userId).all<Row>(),
    db.prepare(`SELECT se.id,se.subscription_id,se.event_type,se.source,se.starts_at,se.ends_at,se.metadata,se.created_at,sp.name AS plan_name
      FROM subscription_events se JOIN subscription_plans sp ON sp.id=se.plan_id
      WHERE se.user_id=?1 ORDER BY se.created_at DESC LIMIT 60`).bind(userId).all<Row>(),
    db.prepare(`SELECT po.id,po.status,po.amount_subunits,po.currency,po.provider_order_id,po.provider_payment_id,po.created_at,po.paid_at,sp.name AS plan_name
      FROM payment_orders po JOIN subscription_plans sp ON sp.id=po.plan_id WHERE po.user_id=?1
      ORDER BY po.created_at DESC LIMIT 30`).bind(userId).all<Row>(),
  ]);
  const now = Date.now();
  const sources: AccessSource[] = [];
  for (const row of subscriptions.results ?? []) {
    const manual = row.source === "manual";
    const end = typeof row.ends_at === "string" ? Date.parse(row.ends_at) : Number.POSITIVE_INFINITY;
    const paidThrough = !manual && row.status === "cancelled" && end > now;
    const active = ["active", "paused"].includes(String(row.status)) || paidThrough;
    if (active && Date.parse(String(row.starts_at)) <= now && end > now) sources.push({
      id: String(row.id), kind: manual ? "manual" : paidThrough ? "paid_through" : "paid",
      label: manual ? "Manual grant" : paidThrough ? "Paid-through / grace" : "Paid subscription",
      planName: String(row.plan_name), status: String(row.status), startsAt: String(row.starts_at),
      endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
      detail: manual ? "Administrative access record; no payment was created." : `Payment source: ${String(row.source)}.`,
    });
  }
  for (const row of promotions.results ?? []) if (Number(row.active) === 1 && Date.parse(String(row.starts_at)) <= now && Date.parse(String(row.ends_at)) > now) sources.push({ id:String(row.id),kind:"promotion",label:"Promotion",planName:String(row.plan_name),status:"active",startsAt:String(row.starts_at),endsAt:String(row.ends_at),detail:String(row.name) });
  for (const row of rewards.results ?? []) if (row.status === "active" && Date.parse(String(row.starts_at)) <= now && Date.parse(String(row.ends_at)) > now) sources.push({ id:String(row.id),kind:"reward",label:"Leaderboard reward",planName:String(row.plan_name),status:String(row.status),startsAt:String(row.starts_at),endsAt:String(row.ends_at),detail:`${String(row.reward_tier)} reward · rank ${String(row.rank)}` });
  for (const row of overrides.results ?? []) if (!row.revoked_at && (!row.expires_at || Date.parse(String(row.expires_at)) > now)) sources.push({ id:String(row.id),kind:"override",label:"Feature override",planName:null,status:Number(row.enabled)===1?"allowed":"blocked",startsAt:String(row.created_at),endsAt:typeof row.expires_at==="string"?row.expires_at:null,detail:String(row.feature_key) });
  const priority: AccessSource["kind"][] = ["paid","paid_through","promotion","reward","manual","override","free"];
  sources.sort((a,b)=>priority.indexOf(a.kind)-priority.indexOf(b.kind));
  if (!sources.length) sources.push({ id:"free",kind:"free",label:"Free",planName:"Free",status:"active",startsAt:null,endsAt:null,detail:"No higher-priority active access source." });
  return {
    effective: sources[0], sources,
    subscriptions: subscriptions.results ?? [], promotions: promotions.results ?? [], rewards: rewards.results ?? [],
    overrides: overrides.results ?? [], events: events.results ?? [], payments: payments.results ?? [],
    grants: (grants.results ?? []).map((row): ManualGrant => ({ id:String(row.id),subscriptionId:String(row.subscription_id),planId:String(row.plan_id),planName:String(row.plan_name),state:String(row.state),startsAt:String(row.starts_at),endsAt:typeof row.ends_at==="string"?row.ends_at:null,reason:String(row.reason),createdBy:String(row.created_by),createdAt:String(row.created_at),updatedAt:String(row.updated_at),revokedAt:typeof row.revoked_at==="string"?row.revoked_at:null,revokeReason:typeof row.revoke_reason==="string"?row.revoke_reason:null })),
  };
}

export async function grantManualSubscriptionAccess(input: { userId:string; planId:string; startsAt:string; endsAt:string; reason:string; idempotencyKey:string; confirmed:boolean; actor:Actor }) {
  if (!input.confirmed) throw new Error("Review and confirm the access grant first.");
  if (!['owner','parent_owner'].includes(input.actor.role)) throw new Error("Manual subscription access requires an Owner role.");
  const db=getD1RuntimeDatabase(),userId=text(input.userId,"User",120),planId=text(input.planId,"Plan",120),why=reason(input.reason),key=text(input.idempotencyKey,"Idempotency key",120);
  const prior=await db.prepare("SELECT id FROM admin_subscription_grants WHERE idempotency_key=?1").bind(key).first<{id:string}>();
  if(prior)return{grantId:prior.id,idempotent:true};
  const startsAt=instant(input.startsAt,"Start time"),endsAt=input.endsAt?instant(input.endsAt,"Expiry time"):null;
  if(endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))throw new Error("Expiry must be after the start time.");
  const [user,plan]=await Promise.all([db.prepare("SELECT user_id FROM app_users WHERE user_id=?1").bind(userId).first(),db.prepare(`SELECT sp.id,ppp.policy_version_id FROM subscription_plans sp JOIN plan_policy_publications ppp ON ppp.plan_id=sp.id WHERE sp.id=?1 AND sp.active=1 AND sp.tier_key<>'free'`).bind(planId).first<{id:string;policy_version_id:string}>()]);
  if(!user)throw new Error("User was not found."); if(!plan)throw new Error("Choose an active plan with a published policy.");
  const now=new Date().toISOString(),grantId=crypto.randomUUID(),subscriptionId=crypto.randomUUID(),state=Date.parse(startsAt)>Date.now()?"scheduled":"active";
  const rows=await db.batch([
    db.prepare("INSERT INTO user_subscriptions(id,user_id,plan_id,status,starts_at,ends_at,source,created_at,updated_at) VALUES(?1,?2,?3,'active',?4,?5,'manual',?6,?6)").bind(subscriptionId,userId,planId,startsAt,endsAt,now),
    db.prepare("INSERT INTO subscription_policy_contracts(subscription_id,policy_version_id,grandfathered,decision_reason,created_at) VALUES(?1,?2,1,'Published policy at manual access grant',?3)").bind(subscriptionId,plan.policy_version_id,now),
    db.prepare("INSERT INTO admin_subscription_grants(id,subscription_id,user_id,plan_id,state,starts_at,ends_at,reason,created_by,idempotency_key,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)").bind(grantId,subscriptionId,userId,planId,state,startsAt,endsAt,why,input.actor.userId,key,now),
    db.prepare("INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,event_type,source,starts_at,ends_at,metadata,created_at) VALUES(?1,?2,?3,?4,'granted','admin_manual',?5,?6,?7,?8)").bind(crypto.randomUUID(),subscriptionId,userId,planId,startsAt,endsAt,JSON.stringify({grantId,reason:why}),now),
    audit(db,input.actor,"subscription.manual.grant",grantId,why,null,{userId,planId,subscriptionId,state,startsAt,endsAt,paymentCreated:false}),
  ]);
  if(rows.some(row=>row.success===false))throw new Error("Manual access could not be granted atomically.");
  await invalidateUserFeatureCache(userId); return{grantId,idempotent:false};
}

export async function changeManualSubscriptionExpiry(input:{grantId:string;endsAt:string;reason:string;confirmed:boolean;actor:Actor}){
  if(!input.confirmed)throw new Error("Review and confirm the expiry change first."); if(!['owner','parent_owner'].includes(input.actor.role))throw new Error("Manual subscription access requires an Owner role.");
  const db=getD1RuntimeDatabase(),grantId=text(input.grantId,"Grant",120),endsAt=instant(input.endsAt,"Expiry time"),why=reason(input.reason);
  const current=await db.prepare("SELECT * FROM admin_subscription_grants WHERE id=?1").bind(grantId).first<Row>(); if(!current)throw new Error("Manual grant was not found."); if(current.state==="revoked")throw new Error("A revoked grant cannot be extended."); if(Date.parse(endsAt)<=Date.parse(String(current.starts_at)))throw new Error("Expiry must be after the start time.");
  const now=new Date().toISOString(),state=Date.parse(String(current.starts_at))>Date.now()?"scheduled":"active";
  const rows=await db.batch([
    db.prepare("UPDATE admin_subscription_grants SET ends_at=?1,state=?2,updated_at=?3 WHERE id=?4 AND state<>'revoked'").bind(endsAt,state,now,grantId),
    db.prepare("UPDATE user_subscriptions SET ends_at=?1,status='active',updated_at=?2 WHERE id=?3").bind(endsAt,now,String(current.subscription_id)),
    db.prepare("INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,event_type,source,starts_at,ends_at,metadata,created_at) VALUES(?1,?2,?3,?4,'extended','admin_manual',?5,?6,?7,?8)").bind(crypto.randomUUID(),String(current.subscription_id),String(current.user_id),String(current.plan_id),String(current.starts_at),endsAt,JSON.stringify({grantId,reason:why}),now),
    audit(db,input.actor,"subscription.manual.expiry.change",grantId,why,{endsAt:current.ends_at},{endsAt,state}),
  ]); if(rows.some(row=>row.success===false))throw new Error("Expiry change could not be committed atomically."); await invalidateUserFeatureCache(String(current.user_id));
}

export async function revokeManualSubscriptionAccess(input:{grantId:string;reason:string;confirmed:boolean;actor:Actor}){
  if(!input.confirmed)throw new Error("Review and confirm the revocation first."); if(!['owner','parent_owner'].includes(input.actor.role))throw new Error("Manual subscription access requires an Owner role.");
  const db=getD1RuntimeDatabase(),grantId=text(input.grantId,"Grant",120),why=reason(input.reason),now=new Date().toISOString();
  const current=await db.prepare("SELECT * FROM admin_subscription_grants WHERE id=?1").bind(grantId).first<Row>(); if(!current)throw new Error("Manual grant was not found."); if(current.state==="revoked")return;
  const rows=await db.batch([
    db.prepare("UPDATE admin_subscription_grants SET state='revoked',revoked_at=?1,revoked_by=?2,revoke_reason=?3,updated_at=?1 WHERE id=?4 AND state<>'revoked'").bind(now,input.actor.userId,why,grantId),
    db.prepare("UPDATE user_subscriptions SET status='cancelled',ends_at=?1,updated_at=?1 WHERE id=?2").bind(now,String(current.subscription_id)),
    db.prepare("INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,event_type,source,starts_at,ends_at,metadata,created_at) VALUES(?1,?2,?3,?4,'cancelled','admin_manual',?5,?6,?7,?8)").bind(crypto.randomUUID(),String(current.subscription_id),String(current.user_id),String(current.plan_id),String(current.starts_at),now,JSON.stringify({grantId,reason:why}),now),
    audit(db,input.actor,"subscription.manual.revoke",grantId,why,{state:current.state,endsAt:current.ends_at},{state:"revoked",endsAt:now}),
  ]); if(rows.some(row=>row.success===false))throw new Error("Revocation could not be committed atomically."); await invalidateUserFeatureCache(String(current.user_id));
}
