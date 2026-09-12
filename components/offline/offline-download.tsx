"use client";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { useState } from "react";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { getOfflineIdentity, saveOfflineFile } from "@/lib/offline/database";
export function OfflineDownload({ id, title }: { id: string; title: string }) {
  const context = useStudentContext();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!context.userId || busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/resources/${encodeURIComponent(id)}/access`, { cache: "no-store" });
      if (!response.ok) throw new Error("Download unavailable. Reconnect and check access to this file.");
      if (Number(response.headers.get("Content-Length")) > 50 * 1024 * 1024) throw new Error("Offline downloads must be smaller than 50 MB.");
      const file = await response.blob();
      if (/text\/html|application\/json/.test(file.type)) throw new Error("The server did not return a downloadable resource.");
      if ((await getOfflineIdentity())?.userId !== context.userId) throw new Error("Your account changed. Download cancelled.");
      if (!navigator.locks) throw new Error("Offline downloads require a browser with Web Locks.");
      await navigator.locks.request("ca-progress-offline-files", () => saveOfflineFile(context.userId!, id, file, { title }));
      setStatus("Saved on this device. Open Offline status to access it.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Download failed."); }
    finally { setBusy(false); }
  }
  if (!OFFLINE_ENABLED) return null;
  return <span><button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save offline"}</button>{status ? <span role="status"> {status}</span> : null}</span>;
}
