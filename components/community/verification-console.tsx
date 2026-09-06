"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunityVerificationAdminModel } from "@/lib/community/phase7";

export function CommunityVerificationConsole({ model }: { model: CommunityVerificationAdminModel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [badgeKind, setBadgeKind] = useState("verified_result");
  const [badgeValue, setBadgeValue] = useState("");
  const [evidenceSource, setEvidenceSource] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reason, setReason] = useState("");

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/community/verifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Verification action failed.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Verification action failed."); }
    finally { setBusy(false); }
  }

  async function grant(event: FormEvent) {
    event.preventDefault();
    await mutate({ action: "grant", targetUserId, badgeKind, badgeValue: badgeKind === "air" ? badgeValue : null, evidenceSource, evidenceReference, reason });
    if (!error) { setBadgeValue(""); setEvidenceSource(""); setEvidenceReference(""); setReason(""); }
  }

  return <section className="phase10-admin-card phase10-admin-card--verification" aria-labelledby="community-verification-heading">
    <header><div><span>Credibility</span><h2 id="community-verification-heading">Evidence-backed verification</h2></div><strong>{model.active.length}</strong></header>
    <p>Badges describe reviewed result/achievement evidence. They never mark a Community answer as correct.</p>
    {error ? <div className="phase10-error" role="alert">{error}</div> : null}
    {model.canManage ? <form onSubmit={grant} className="phase10-verification-form">
      <label>Student user ID<input required value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} placeholder="Stable CA Progress user ID"/></label>
      <label>Badge<select value={badgeKind} onChange={(event) => setBadgeKind(event.target.value)}><option value="verified_result">Verified Result</option><option value="exemption">Exemption</option><option value="score_70">70%+</option><option value="score_75">75%+</option><option value="score_80">80%+</option><option value="ranker">Ranker</option><option value="air">AIR #</option></select></label>
      {badgeKind === "air" ? <label>AIR rank<input required inputMode="numeric" pattern="[0-9]{1,4}" value={badgeValue} onChange={(event) => setBadgeValue(event.target.value)} placeholder="e.g. 42"/></label> : null}
      <label>Evidence source<input required minLength={2} maxLength={160} value={evidenceSource} onChange={(event) => setEvidenceSource(event.target.value)} placeholder="e.g. ICAI result PDF"/></label>
      <label>Evidence reference<input required minLength={2} maxLength={500} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Private/internal reference or verified source URL"/></label>
      <label>Reviewer note<input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional review note"/></label>
      <button className="ui-button ui-button--primary" disabled={busy}>{busy ? "Saving…" : "Grant verification"}</button>
    </form> : <div className="phase10-admin-empty"><p>Your moderator role can review reports and enforce Community rules, but only admins/owners can grant or revoke verification.</p></div>}

    {model.active.length ? <div className="phase10-audit-table">{model.active.map((verification) => <div key={verification.id}><time>{new Date(verification.grantedAt).toLocaleString()}</time><strong>{verification.badge}</strong><span>{verification.userLabel}</span><span>{verification.evidenceSource}</span>{model.canManage ? <button type="button" disabled={busy} onClick={() => void mutate({ action: "revoke", verificationId: verification.id, reason: "Verification revoked after evidence review" })}>Revoke</button> : null}</div>)}</div> : <div className="phase10-admin-empty"><p>No active Community verifications.</p></div>}

    {model.audit.length ? <details><summary>Verification audit history</summary><div className="phase10-audit-table">{model.audit.map((entry) => <div key={entry.id}><time>{new Date(entry.createdAt).toLocaleString()}</time><strong>{entry.action}</strong><span>{entry.actorRole}</span><span>{entry.targetUserId}</span><small>{entry.reason ?? "No reviewer note"}</small></div>)}</div></details> : null}
  </section>;
}
