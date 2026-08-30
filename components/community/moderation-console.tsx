"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { CommunityModerationModel } from "@/lib/community/types";

type ReadyModel = Extract<CommunityModerationModel, { mode: "ready" }>;

export function CommunityModerationConsole({ model }: { model: ReadyModel }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(input: Record<string, unknown>, key: string) {
    setBusy(key); setError(null);
    try {
      const response = await fetch("/api/admin/community/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Moderation action failed.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Moderation action failed."); }
    finally { setBusy(null); }
  }

  return <div className="phase10-moderation-grid">
    {error ? <div className="phase10-error" role="alert">{error}</div> : null}
    <section className="phase10-admin-card phase10-admin-card--reports"><header><div><span>Queue</span><h2>Open reports</h2></div><strong>{model.reports.length}</strong></header>{model.reports.length ? <div className="phase10-report-list">{model.reports.map((report) => <article key={report.id}><div className="phase10-report-top"><span>{report.reason.replaceAll("_"," ")}</span><time>{new Date(report.createdAt).toLocaleString()}</time></div><small>{report.channelTitle}</small><blockquote><strong>{report.message.authorLabel}</strong><p>{report.message.body}</p></blockquote>{report.details ? <p className="phase10-report-detail">Reporter note: {report.details}</p> : null}<div className="phase10-admin-actions"><button disabled={Boolean(busy)} onClick={() => void act({ action:"delete_message", messageId:report.message.id, reportId:report.id, reason:"Reported message removed" }, `delete:${report.id}`)}>Remove message</button><select defaultValue="" disabled={Boolean(busy)} onChange={(event) => { const durationMinutes=Number(event.target.value); if (durationMinutes) void act({ action:"block", messageId:report.message.id, reportId:report.id, targetUserId:report.message.userId, reason:"Chat violation", durationMinutes }, `block:${report.id}`); event.currentTarget.value=""; }}><option value="">Block author…</option><option value="60">1 hour</option><option value="480">8 hours</option><option value="1440">24 hours</option><option value="2880">48 hours</option></select><button disabled={Boolean(busy)} onClick={() => void act({ action:"resolve_report", reportId:report.id, reason:"Reviewed and resolved" }, `resolve:${report.id}`)}>Resolve</button><button disabled={Boolean(busy)} onClick={() => void act({ action:"dismiss_report", reportId:report.id, reason:"No action required" }, `dismiss:${report.id}`)}>Dismiss</button></div></article>)}</div> : <div className="phase10-admin-empty"><Icon name="check"/><strong>No open reports</strong><p>The Community moderation queue is clear.</p></div>}</section>

    <section className="phase10-admin-card"><header><div><span>Active enforcement</span><h2>Chat blocks</h2></div><strong>{model.blocks.length}</strong></header>{model.blocks.length ? <div className="phase10-block-list">{model.blocks.map((block) => <article key={block.id}><div><strong>{block.userLabel}</strong><span>{block.channelTitle ?? "All Community channels"}</span><small>{block.reason}</small><time>Until {new Date(block.endsAt).toLocaleString()}</time></div><button disabled={Boolean(busy)} onClick={() => void act({ action:"unblock", targetUserId:block.userId, channelId:block.channelId, reason:"Block ended by moderator" }, `unblock:${block.id}`)}>Unblock</button></article>)}</div> : <div className="phase10-admin-empty"><p>No active chat blocks.</p></div>}</section>

    <section className="phase10-admin-card phase10-admin-card--audit"><header><div><span>Audit</span><h2>Moderator action log</h2></div></header>{model.actions.length ? <div className="phase10-audit-table">{model.actions.map((action) => <div key={action.id}><time>{new Date(action.createdAt).toLocaleString()}</time><strong>{action.actionType.replaceAll("_"," ")}</strong><span>{action.actorRole}</span><span>{action.channelTitle ?? "Global"}</span><small>{action.reason ?? "No reason supplied"}</small></div>)}</div> : <div className="phase10-admin-empty"><p>No moderation actions have been recorded yet.</p></div>}</section>
  </div>;
}
