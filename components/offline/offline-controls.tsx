"use client";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { useCallback, useEffect, useState } from "react";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { clearOfflineOwner, discardOfflineMutationChain, exportOfflineOwner, flushPendingMutations, getOfflineFiles, getOfflineMeta, getPendingMutations, offlineStorageEstimate, removeOfflineRow, retryOfflineConflict } from "@/lib/offline/database";
import type { OfflineMutation } from "@/lib/offline/database";
const size = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
function downloadBlob(blob: Blob, name: string) { const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(href), 30_000); }
const editLabel = (url: string) => ({ "/api/progress": "Chapter progress", "/api/planner/tasks": "Planner task", "/api/notes": "Revision note", "/api/study/timer": "Focus session" })[url] ?? "Offline edit";
const value = (input: unknown) => input === null || input === undefined || input === "" ? "Not set" : typeof input === "boolean" ? (input ? "Yes" : "No") : typeof input === "object" ? JSON.stringify(input) : String(input);
export function OfflineControls() {
  const context = useStudentContext();
  const [rows, setRows] = useState<OfflineMutation[]>([]);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof getOfflineFiles>>>([]);
  const [state, setState] = useState({ online: true, usage: 0, quota: 0, last: "Never" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!OFFLINE_ENABLED || !context.userId) return;
    const [pending, storage, last, downloads] = await Promise.all([getPendingMutations(context.userId), offlineStorageEstimate(), getOfflineMeta<{ at?: string }>(context.userId, "last-sync"), getOfflineFiles(context.userId)]);
    setRows(pending); setFiles(downloads); setState({ online: navigator.onLine, ...storage, last: last?.at ? new Date(last.at).toLocaleString() : "Never" });
  }, [context.userId]);
  useEffect(() => {
    const update = () => void refresh().catch(() => setError("Offline storage is unavailable."));
    update(); for (const event of ["online", "offline", "offline-data-change"]) window.addEventListener(event, update);
    return () => { for (const event of ["online", "offline", "offline-data-change"]) window.removeEventListener(event, update); };
  }, [refresh]);
  if (!OFFLINE_ENABLED) return <p>Offline access is awaiting browser verification and rollout.</p>;
  if (!context.userId) return null;
  async function act(action: () => Promise<unknown>) { setBusy(true); setError(null); try { await action(); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Offline action failed."); } finally { setBusy(false); } }
  async function clear() {
    if (!confirm(`Clear this account’s offline data on this device? ${rows.length ? `${rows.length} unsynchronized edits will be lost. Export them first. ` : ""}Cloud data will not be deleted.`)) return;
    if (!navigator.locks) throw new Error("Close other tabs before clearing using your browser's site storage settings.");
    await navigator.locks.request("ca-progress-offline-sync", () => clearOfflineOwner(context.userId!));
  }
  async function acceptCloud(row: OfflineMutation) {
    if (!confirm("Use the cloud version? This removes this local edit and any later edits that depend on it. Download the edit first if you need a copy.")) return;
    await discardOfflineMutationChain(context.userId!, row.key);
    await refresh();
    if (navigator.onLine) location.reload();
  }
  async function keepLocal(row: OfflineMutation) {
    await retryOfflineConflict(context.userId!, row.key);
    await flushPendingMutations(context.userId!);
    await refresh();
  }
  function downloadEdit(row: OfflineMutation) {
    downloadBlob(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), edit: row }, null, 2)], { type: "application/json" }), `ca-progress-offline-edit-${row.idempotencyKey}.json`);
  }
  return <section aria-label="Offline data" className="offline-controls">
    <p role="status">{state.online ? "Online" : "Offline"} · {rows.length} pending edits · Last successful sync {state.last}</p><p>{size(state.usage)} browser storage used{state.quota ? ` of ${size(state.quota)}` : ""}</p>
    <div className="phase11-header-links"><button type="button" disabled={busy || !state.online} onClick={() => void act(() => flushPendingMutations(context.userId!))}>Sync now</button><button type="button" disabled={busy} onClick={() => void act(async () => downloadBlob(new Blob([JSON.stringify(await exportOfflineOwner(context.userId!), null, 2)], { type: "application/json" }), "ca-progress-offline-export.json"))}>Export offline data</button><button type="button" disabled={busy} onClick={() => void act(clear)}>Clear this device</button><a href="/offline">Offline status</a></div>
    {error ? <p role="alert">{error}</p> : null}
    {rows.length ? <details open={rows.some(row => row.status !== "pending")}><summary>Review pending edits ({rows.length})</summary><p>Edits synchronize in order. Nothing is overwritten automatically when another device or academic selection changed.</p><ul className="offline-edit-list">{rows.map(row => <li key={row.key} className={`offline-edit offline-edit--${row.status}`}><div className="offline-edit__heading"><div><strong>{editLabel(row.url)}</strong><span>{row.status === "pending" ? "Waiting to sync" : row.status === "conflict" ? "Choose which version to keep" : "Action required"}</span></div><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time></div>{row.lastError ? <p role={row.status === "pending" ? undefined : "alert"}>{row.lastError}</p> : null}
      {row.conflict ? <details className="offline-compare"><summary>Compare versions</summary><div className="offline-compare__grid"><section><h4>Your saved edit</h4><dl>{Object.entries(row.conflict.local).map(([name, item]) => <div key={name}><dt>{name}</dt><dd>{value(item)}</dd></div>)}</dl></section><section><h4>Current cloud version</h4><dl>{Object.entries(row.conflict.current ?? {}).map(([name, item]) => <div key={name}><dt>{name}</dt><dd>{value(item)}</dd></div>)}</dl>{row.conflict.current === null ? <p>This item no longer exists in the cloud.</p> : null}</section></div></details> : null}
      <div className="offline-edit__actions"><button type="button" disabled={busy} onClick={() => downloadEdit(row)}>Download edit</button>{row.status === "conflict" && row.conflict ? <button type="button" disabled={busy || !state.online} onClick={() => void act(() => keepLocal(row))}>Apply my version</button> : null}{row.status !== "pending" ? <button type="button" disabled={busy} onClick={() => void act(() => acceptCloud(row))}>Use cloud version</button> : null}</div>
    </li>)}</ul></details> : null}
    {files.length ? <details><summary>Offline files ({files.length})</summary><ul>{files.map(row => <li key={row.key}>{row.metadata.title ?? row.id} · {size(row.file.size)} <button type="button" onClick={() => downloadBlob(row.file, row.metadata.title ?? "resource")}>Download saved file</button> <button type="button" onClick={() => void act(() => removeOfflineRow("files", row.key))}>Remove download</button></li>)}</ul></details> : null}
  </section>;
}
