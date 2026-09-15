"use client";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { useEffect } from "react";
import { putOfflineSnapshot } from "@/lib/offline/database";
import { useStudentContext } from "@/components/academic/student-context-provider";

export function OfflineSnapshot({ kind, data }: { kind: string; data: unknown }) {
  const context = useStudentContext();
  useEffect(() => {
    if (OFFLINE_ENABLED && context.mode === "ready" && context.userId) {
      putOfflineSnapshot(context.userId, `${context.contextKey}:${kind}`, data).catch(() => {
        window.dispatchEvent(new CustomEvent("offline-storage-error", { detail: "This screen could not be saved for offline use. Check available device storage." }));
      });
    }
  }, [context.mode, context.userId, context.contextKey, kind, data]);
  return null;
}
