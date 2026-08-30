"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { UploadCard, ResourceEntityType } from "@/lib/resources/types";

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const raw = await response.text();
  let payload: { error?: string } = {};
  if (raw) {
    try { payload = JSON.parse(raw) as { error?: string }; }
    catch { payload = { error: response.ok ? undefined : `Request failed (${response.status}).` }; }
  }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

export function ResourceAccessButtons({ resource, canManage, canReport }: { resource: UploadCard; canManage: boolean; canReport: boolean }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(resource.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(download: boolean) {
    setError(null);
    const target = `/api/resources/${resource.id}/access${download ? "?download=1" : ""}`;
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (!opened) setError("Your browser blocked the file window. Allow pop-ups for this site and try again.");
  }

  async function saveVisibility() {
    setBusy(true); setError(null);
    try {
      await jsonRequest(`/api/resources/${resource.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: resource.title, description: resource.description, subjectId: resource.subjectId, chapterId: resource.chapterId, visibility }) });
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Visibility could not be saved."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Delete this file permanently from private storage?")) return;
    setBusy(true); setError(null);
    try { await jsonRequest(`/api/resources/${resource.id}`, { method: "DELETE" }); router.push("/resources"); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Resource could not be deleted."); setBusy(false); }
  }

  async function report() {
    const reason = window.prompt("Report reason: spam, misleading, copyright, unsafe, or other", "other")?.trim().toLowerCase();
    if (!reason) return;
    const details = window.prompt("Optional details for the moderator") ?? "";
    setBusy(true); setError(null);
    try { await jsonRequest("/api/resources/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: "upload", entityId: resource.id, reason, details }) }); router.push("/resources"); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Report could not be submitted."); }
    finally { setBusy(false); }
  }

  return <div className="phase7-resource-actions"><div className="phase7-action-row"><button disabled={busy} className="ui-button ui-button--primary" onClick={() => open(false)}><Icon name="book" size={17}/> Preview</button><button disabled={busy} className="ui-button ui-button--secondary" onClick={() => open(true)}><Icon name="arrow" size={17}/> Download</button>{canReport ? <button disabled={busy} className="ui-button ui-button--secondary" onClick={() => void report()}><Icon name="shield" size={17}/> Report</button> : null}</div>{canManage ? <div className="phase7-owner-controls"><label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as UploadCard["visibility"])}><option value="private">Private</option><option value="shared">Share with Community</option></select></label><button disabled={busy || visibility === resource.visibility} className="ui-button ui-button--secondary" onClick={() => void saveVisibility()}>Save visibility</button><button disabled={busy} className="phase7-danger-button" onClick={() => void remove()}>Delete file</button></div> : null}{canManage && visibility === "shared" ? <div className="phase7-policy-note"><Icon name="shield" size={17}/><span>Changing a private file to Shared submits it for moderation. Changes to an approved shared item return it to pending review.</span></div> : null}{error ? <div className="phase7-inline-error" role="alert">{error}</div> : null}</div>;
}

export function NoteOwnerActions({ id, canReport }: { id: string; canReport: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function remove() { if (!window.confirm("Delete this note?")) return; setBusy(true); try { await jsonRequest(`/api/notes/${id}`, { method: "DELETE" }); router.push("/notes"); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Note could not be deleted."); setBusy(false); } }
  async function report() { const reason = window.prompt("Report reason: spam, misleading, copyright, unsafe, or other", "other")?.trim().toLowerCase(); if (!reason) return; const details = window.prompt("Optional details for the moderator") ?? ""; setBusy(true); setError(null); try { await jsonRequest("/api/resources/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: "note" satisfies ResourceEntityType, entityId: id, reason, details }) }); router.push("/resources"); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Report could not be submitted."); } finally { setBusy(false); } }
  return <div className="phase7-action-row">{canReport ? <button disabled={busy} className="ui-button ui-button--secondary" onClick={() => void report()}><Icon name="shield" size={17}/> Report</button> : <button disabled={busy} className="phase7-danger-button" onClick={() => void remove()}>Delete note</button>}{error ? <span className="phase7-inline-error">{error}</span> : null}</div>;
}
