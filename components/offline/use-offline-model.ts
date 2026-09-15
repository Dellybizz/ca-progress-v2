"use client";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { useEffect, useState } from "react";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { projectedSnapshot } from "@/lib/offline/mutation";

export function useOfflineModel<T>(kind: string, serverModel: T) {
  const context = useStudentContext();
  const [local, setLocal] = useState<T | null>(null);
  useEffect(() => {
    if (!OFFLINE_ENABLED) return;
    let active = true;
    const update = async () => {
      if (!context.userId) return;
      const data = await projectedSnapshot<T>(context.userId, context.contextKey, kind);
      if (active && data) setLocal(data);
    };
    const listener = () => void update().catch(() => undefined);
    window.addEventListener("offline-data-change", listener);
    if (!navigator.onLine) listener();
    return () => { active = false; window.removeEventListener("offline-data-change", listener); };
  }, [context.userId, context.contextKey, kind, serverModel]);
  return local ?? serverModel;
}
