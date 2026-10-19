"use client";

import { useEffect, useState } from "react";

type DeletionRequest = { status: string; requested_at: string; scheduled_for: string; retention_note: string };

export function AccountDeletionControls({ authenticated }: { authenticated: boolean }) {
  const [record, setRecord] = useState<DeletionRequest | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (authenticated) void fetch("/api/account-deletion", { cache: "no-store" }).then((response) => response.json()).then((value) => setRecord(value.request ?? null)).catch(() => undefined); }, [authenticated]);
  if (!authenticated) return <p>Sign in to the CA Progress account you want to delete, then return to this page.</p>;
  async function schedule() { setBusy(true); setNotice(null); try { const response = await fetch("/api/account-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error || "Deletion could not be scheduled."); setNotice("Account deletion is scheduled. You can cancel during the seven-day safety window."); const refreshed = await fetch("/api/account-deletion", { cache: "no-store" }).then((result) => result.json()); setRecord(refreshed.request ?? null); } catch (error) { setNotice(error instanceof Error ? error.message : "Deletion could not be scheduled."); } finally { setBusy(false); } }
  async function cancel() { setBusy(true); setNotice(null); try { const response = await fetch("/api/account-deletion", { method: "DELETE" }); if (!response.ok) throw new Error("Cancellation failed."); setRecord(null); setConfirmation(""); setNotice("Account deletion was cancelled."); } catch (error) { setNotice(error instanceof Error ? error.message : "Cancellation failed."); } finally { setBusy(false); } }
  if (record?.status === "scheduled") return <div className="phase6-form"><p><strong>Deletion scheduled for {new Date(record.scheduled_for).toLocaleString()}.</strong></p><p>Sign-in sessions will be revoked and personal study data will be removed by the deletion processor. {record.retention_note}</p><button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel deletion request"}</button>{notice ? <p role="status">{notice}</p> : null}</div>;
  return <div className="phase6-form"><p>This schedules deletion after a seven-day safety window. Download any data you want to keep first.</p><label><span>Type DELETE MY ACCOUNT</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off"/></label><button className="ui-button ui-button--secondary" type="button" disabled={busy || confirmation !== "DELETE MY ACCOUNT"} onClick={() => void schedule()}>{busy ? "Scheduling…" : "Request account deletion"}</button>{notice ? <p role="status">{notice}</p> : null}</div>;
}
