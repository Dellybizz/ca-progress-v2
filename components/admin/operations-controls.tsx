"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminRole = "moderator" | "admin" | "owner" | "parent_owner";

async function send(url: string, method: "PATCH" | "POST", body: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || "Admin change failed.");
  return data;
}

function useMutation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); router.refresh(); }
    catch (value) { setError(value instanceof Error ? value.message : "Admin change failed."); }
    finally { setBusy(false); }
  }
  return { busy, error, run };
}

export function MemberRoleControl({ userId, currentRole, active, operatorRole }: { userId: string; currentRole: string; active: boolean; operatorRole: AdminRole }) {
  const mutation = useMutation();
  const options: AdminRole[] = operatorRole === "parent_owner" ? ["moderator","admin","owner"] : ["moderator","admin"];
  const [role, setRole] = useState(options.includes(currentRole as AdminRole) ? currentRole : options[0]);
  return <div className="phase12-inline-control">
    <select aria-label="Admin role" value={role} disabled={mutation.busy || currentRole === "parent_owner"} onChange={(event) => setRole(event.target.value)}>{options.map((item) => <option key={item} value={item}>{item.replace("_"," ")}</option>)}</select>
    <button disabled={mutation.busy || currentRole === "parent_owner" || role === currentRole} onClick={() => void mutation.run(() => send("/api/admin/members","PATCH",{ action:"role",userId,role }))}>Save role</button>
    {currentRole !== "student" && currentRole !== "parent_owner" ? <button className="phase12-button-quiet" disabled={mutation.busy} onClick={() => void mutation.run(() => send("/api/admin/members","PATCH",{ action:"active",userId,active:!active }))}>{active ? "Disable admin" : "Restore admin"}</button> : null}
    {mutation.error ? <small className="phase12-error-text">{mutation.error}</small> : null}
  </div>;
}

export function FeatureFlagToggle({ flagKey, enabled, canEdit }: { flagKey: string; enabled: boolean; canEdit: boolean }) {
  const mutation = useMutation();
  return <div className="phase12-toggle-row"><span className={enabled ? "is-on" : "is-off"}>{enabled ? "Enabled" : "Disabled"}</span><button disabled={!canEdit || mutation.busy} onClick={() => void mutation.run(() => send("/api/admin/platform","PATCH",{ action:"feature",flagKey,enabled:!enabled }))}>{enabled ? "Turn off" : "Turn on"}</button>{mutation.error ? <small className="phase12-error-text">{mutation.error}</small> : null}</div>;
}

export function MaintenanceControl({ initial, canEdit }: { initial: { enabled?: boolean; message?: string; starts_at?: string | null; ends_at?: string | null } | null; canEdit: boolean }) {
  const mutation = useMutation();
  const [enabled,setEnabled] = useState(Boolean(initial?.enabled));
  const [message,setMessage] = useState(initial?.message || "CA Progress is temporarily in maintenance mode.");
  return <div className="phase12-form-grid">
    <label><span>Maintenance state</span><select value={enabled ? "on" : "off"} disabled={!canEdit} onChange={(event) => setEnabled(event.target.value === "on")}><option value="off">Normal operation</option><option value="on">Maintenance mode</option></select></label>
    <label className="phase12-form-span"><span>User-facing message</span><textarea rows={3} value={message} disabled={!canEdit} maxLength={500} onChange={(event) => setMessage(event.target.value)}/></label>
    <button className="ui-button ui-button--primary" disabled={!canEdit || mutation.busy} onClick={() => void mutation.run(() => send("/api/admin/platform","PATCH",{ action:"maintenance",enabled,message,startsAt:initial?.starts_at ?? null,endsAt:initial?.ends_at ?? null }))}>Save maintenance state</button>
    {mutation.error ? <small className="phase12-error-text phase12-form-span">{mutation.error}</small> : null}
  </div>;
}

export function PlanControl({ plan, canEdit }: { plan: Record<string, unknown>; canEdit: boolean }) {
  const mutation = useMutation();
  const [price,setPrice] = useState(plan.price_subunits == null ? "" : String(plan.price_subunits));
  const [checkout,setCheckout] = useState(Boolean(plan.checkout_enabled));
  const [active,setActive] = useState(Boolean(plan.active));
  const free = plan.tier_key === "free";
  return <div className="phase12-plan-control">
    <label><span>Price (subunits)</span><input inputMode="numeric" value={price} disabled={!canEdit || free} placeholder="Not configured" onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g,""))}/></label>
    <label><span>Checkout</span><select value={checkout ? "on" : "off"} disabled={!canEdit || free} onChange={(event) => setCheckout(event.target.value === "on")}><option value="off">Disabled</option><option value="on">Enabled</option></select></label>
    <label><span>Plan state</span><select value={active ? "active" : "inactive"} disabled={!canEdit || free} onChange={(event) => setActive(event.target.value === "active")}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    <button disabled={!canEdit || free || mutation.busy} onClick={() => void mutation.run(() => send("/api/admin/plans","PATCH",{ action:"plan",planId:plan.id,priceSubunits:price ? Number(price) : null,checkoutEnabled:checkout,active }))}>Save plan</button>
    {mutation.error ? <small className="phase12-error-text">{mutation.error}</small> : null}
  </div>;
}

export function EntitlementControl({ row, canEdit }: { row: Record<string, unknown>; canEdit: boolean }) {
  const mutation = useMutation();
  const [enabled,setEnabled] = useState(Boolean(row.enabled));
  const [unit,setUnit] = useState(String(row.limit_unit || "unlimited"));
  const [limit,setLimit] = useState(row.limit_value == null ? "" : String(row.limit_value));
  return <div className="phase12-entitlement-control">
    <select aria-label="Feature access" value={enabled ? "on" : "off"} disabled={!canEdit} onChange={(event) => setEnabled(event.target.value === "on")}><option value="on">Allowed</option><option value="off">Locked</option></select>
    <select aria-label="Limit unit" value={unit} disabled={!canEdit} onChange={(event) => { const next=event.target.value; setUnit(next); if(next==="unlimited") setLimit(""); }}><option value="unlimited">Unlimited</option><option value="count">Count</option><option value="minutes">Minutes</option><option value="megabytes">MB</option></select>
    <input aria-label="Limit value" inputMode="decimal" disabled={!canEdit || unit === "unlimited"} value={limit} placeholder={unit === "unlimited" ? "—" : "0"} onChange={(event) => setLimit(event.target.value.replace(/[^0-9.]/g,""))}/>
    <button disabled={!canEdit || mutation.busy} onClick={() => void mutation.run(() => send("/api/admin/plans","PATCH",{ action:"entitlement",planId:row.plan_id,featureKey:row.feature_key,enabled,limitUnit:unit,limitValue:unit === "unlimited" ? null : Number(limit || "0"),upgradeMessage:String(row.upgrade_message || "") }))}>Save</button>
    {mutation.error ? <small className="phase12-error-text">{mutation.error}</small> : null}
  </div>;
}

export function NotificationTemplateComposer({ canEdit }: { canEdit: boolean }) {
  const mutation = useMutation();
  const [key,setKey] = useState(""); const [name,setName]=useState(""); const [title,setTitle]=useState(""); const [body,setBody]=useState("");
  return <div className="phase12-form-grid">
    <label><span>Template key</span><input value={key} disabled={!canEdit} placeholder="exam.reminder" onChange={(event) => setKey(event.target.value.toLowerCase())}/></label>
    <label><span>Name</span><input value={name} disabled={!canEdit} placeholder="Exam reminder" onChange={(event) => setName(event.target.value)}/></label>
    <label className="phase12-form-span"><span>Notification title</span><input value={title} disabled={!canEdit} maxLength={180} onChange={(event) => setTitle(event.target.value)}/></label>
    <label className="phase12-form-span"><span>Message body</span><textarea rows={5} value={body} disabled={!canEdit} maxLength={4000} onChange={(event) => setBody(event.target.value)}/></label>
    <button className="ui-button ui-button--primary" disabled={!canEdit || mutation.busy || !key || !name || !title || !body} onClick={() => void mutation.run(async () => { await send("/api/admin/notifications","POST",{ templateKey:key,name,title,body,active:true }); setKey("");setName("");setTitle("");setBody(""); })}>Save template</button>
    {mutation.error ? <small className="phase12-error-text phase12-form-span">{mutation.error}</small> : null}
  </div>;
}

export function ContentStateControl({ entityType, entityId, status, verificationStatus, canEdit }: { entityType: "syllabus_version" | "exam_attempt" | "icai_resource"; entityId: string; status: string; verificationStatus?: string; canEdit: boolean }) {
  const mutation = useMutation();
  const statusOptions = entityType === "syllabus_version" ? ["published","superseded","upcoming"] : entityType === "exam_attempt" ? ["scheduled","open","completed","cancelled"] : ["active","removed","replaced"];
  const [nextStatus,setNextStatus] = useState(status);
  const [verification,setVerification] = useState(verificationStatus || "verified");
  return <div className="phase12-content-control"><select value={nextStatus} disabled={!canEdit} onChange={(event) => setNextStatus(event.target.value)}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select>{entityType !== "syllabus_version" ? <select value={verification} disabled={!canEdit} onChange={(event) => setVerification(event.target.value)}><option value="verified">verified</option><option value="pending_review">pending review</option><option value="rejected">rejected</option></select> : null}<button disabled={!canEdit || mutation.busy} onClick={() => void mutation.run(() => send("/api/admin/content","PATCH",{ entityType,entityId,status:nextStatus,verificationStatus:entityType === "syllabus_version" ? null : verification }))}>Save</button>{mutation.error ? <small className="phase12-error-text">{mutation.error}</small> : null}</div>;
}
