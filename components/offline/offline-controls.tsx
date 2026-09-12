"use client";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { useCallback, useEffect, useState } from "react";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { clearOfflineOwner, exportOfflineOwner, flushPendingMutations, getOfflineFiles, getOfflineMeta, getPendingMutations, offlineStorageEstimate, removeOfflineRow } from "@/lib/offline/database";
import type { OfflineMutation } from "@/lib/offline/database";
const size = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
function downloadBlob(blob: Blob, name: string) { const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(href), 30_000); }
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
  return <section aria-label="Offline data" className="offline-controls">
    <p role="status">{state.online ? "Online" : "Offline"} · {rows.length} pending edits · Last successful sync {state.last}</p><p>{size(state.usage)} browser storage used{state.quota ? ` of ${size(state.quota)}` : ""}</p>
    <div className="phase11-header-links"><button type="button" disabled={busy || !state.online} onClick={() => void act(() => flushPendingMutations(context.userId!))}>Sync now</button><button type="button" disabled={busy} onClick={() => void act(async () => downloadBlob(new Blob([JSON.stringify(await exportOfflineOwner(context.userId!), null, 2)], { type: "application/json" }), "ca-progress-offline-export.json"))}>Export offline data</button><button type="button" disabled={busy} onClick={() => void act(clear)}>Clear this device</button><a href="/offline">Offline status</a></div>
    {error ? <p role="alert">{error}</p> : null}
    {rows.length ? <details><summary>Review pending edits ({rows.length})</summary><p>Conflicts stop synchronization to preserve edit order. Export the affected edits, compare with the online records, then clear the local queue only after retaining your work.</p><ul>{rows.map(row => <li key={row.key}><strong>{row.url} · {row.status}</strong> · {row.createdAt}{row.lastError ? <p>{row.lastError}</p> : null}</li>)}</ul></details> : null}
    {files.length ? <details><summary>Offline files ({files.length})</summary><ul>{files.map(row => <li key={row.key}>{row.metadata.title ?? row.id} · {size(row.file.size)} <button type="button" onClick={() => downloadBlob(row.file, row.metadata.title ?? "resource")}>Download saved file</button> <button type="button" onClick={() => void act(() => removeOfflineRow("files", row.key))}>Remove download</button></li>)}</ul></details> : null}
  </section>;
}
