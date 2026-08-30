"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { ModerationPageModel } from "@/lib/resources/types";

type Ready = Extract<ModerationPageModel, { mode: "ready" }>;

export function ModerationQueue({ model }: { model: Ready }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(entityType: "note" | "upload", entityId: string, decision: "approve" | "reject") {
    const notes = decision === "reject" ? window.prompt("Optional rejection reason for audit history") ?? "" : "";
    setBusyId(entityId); setError(null);
    try {
      const response = await fetch("/api/admin/resources/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType, entityId, decision, notes }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Moderation decision failed.");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Moderation decision failed."); }
    finally { setBusyId(null); }
  }

  return <div className="phase7-moderation"><section className="phase7-moderation-stats"><div><Icon name="shield"/><span><strong>{model.queue.filter((item) => item.status === "pending").length}</strong><small>pending review</small></span></div><div><Icon name="bell"/><span><strong>{model.queue.filter((item) => item.status === "reported").length}</strong><small>reported</small></span></div><div><Icon name="layers"/><span><strong>{model.reports.length}</strong><small>open reports</small></span></div></section>{error ? <div className="phase7-inline-error" role="alert">{error}</div> : null}<Card><CardHeader title="Shared-resource moderation" description="Nothing becomes visible in the Community library until an authorized moderator approves it." action={<Badge tone="brand">{model.role}</Badge>}/><CardBody>{model.queue.length ? <div className="phase7-moderation-list">{model.queue.map((item) => <article key={`${item.entityType}:${item.id}`}><div className="phase7-moderation-copy"><div><Badge tone={item.status === "reported" ? "danger" : "warning"}>{item.status}</Badge><span>{item.kindLabel}</span></div><h3>{item.title}</h3><p>{item.description || "No description provided."}</p><small>Shared by {item.ownerLabel} · {new Date(item.submittedAt).toLocaleString()}</small></div><div className="phase7-moderation-actions"><a className="ui-button ui-button--secondary" href={item.entityType === "note" ? `/notes/${item.id}` : `/resources/${item.id}`} target="_blank" rel="noreferrer">Review</a><button disabled={busyId === item.id} className="ui-button ui-button--primary" onClick={() => void decide(item.entityType, item.id, "approve")}>Approve</button><button disabled={busyId === item.id} className="phase7-danger-button" onClick={() => void decide(item.entityType, item.id, "reject")}>Reject</button></div></article>)}</div> : <EmptyState icon="shield" title="Moderation queue is clear" description="New shared uploads and notes will appear here as Pending before Community publication."/>}</CardBody></Card><Card><CardHeader title="Open reports" description="A report immediately hides the approved shared item and places it back into moderator review."/><CardBody>{model.reports.length ? <div className="phase7-report-list">{model.reports.map((report) => <div key={report.id}><span><Badge tone="danger">{report.reason}</Badge><strong>{report.entityType}</strong></span><p>{report.details || "No additional details."}</p><small>{new Date(report.createdAt).toLocaleString()}</small></div>)}</div> : <p className="phase7-muted">No open community reports.</p>}</CardBody></Card></div>;
}
