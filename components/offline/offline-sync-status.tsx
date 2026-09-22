"use client";

import { useCallback, useEffect, useState } from "react";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { getPendingMutations } from "@/lib/offline/database";
import { Icon } from "@/components/ui/icon";

export function OfflineSyncStatus() {
  const context = useStudentContext();
  const [status, setStatus] = useState({ pending: 0, review: 0 });
  const refresh = useCallback(async () => {
    if (!OFFLINE_ENABLED || !context.userId) return setStatus({ pending: 0, review: 0 });
    const rows = await getPendingMutations(context.userId);
    setStatus({ pending: rows.length, review: rows.filter(row => row.status !== "pending").length });
  }, [context.userId]);
  useEffect(() => {
    const update = () => void refresh().catch(() => undefined);
    update();
    window.addEventListener("offline-data-change", update);
    window.addEventListener("online", update);
    return () => { window.removeEventListener("offline-data-change", update); window.removeEventListener("online", update); };
  }, [refresh]);
  if (!status.pending) return null;
  return <a className={`offline-sync-status${status.review ? " offline-sync-status--review" : ""}`} href="/offline" role="status" aria-live="polite">
    <Icon name={status.review ? "alert" : "clock"} size={14}/>
    <span>{status.review ? `${status.review} offline ${status.review === 1 ? "edit needs" : "edits need"} review` : `${status.pending} ${status.pending === 1 ? "edit" : "edits"} waiting to sync`}</span>
  </a>;
}
