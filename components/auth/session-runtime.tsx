"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type SessionPayload = { authenticated?: boolean; session?: { rotateRecommended?: boolean } };

export function SessionRuntime({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    const check = async () => {
      if (stopped || !navigator.onLine || document.visibilityState === "hidden") return;
      const response = await fetch("/api/v1/session", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); router.refresh(); return; }
      const payload = await response.json() as SessionPayload;
      if (payload.session?.rotateRecommended) await fetch("/api/v1/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ action: "rotate" }) });
    };
    const run = () => void check().catch(() => undefined);
    const interval = window.setInterval(run, 10 * 60 * 1000);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    run();
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run); };
  }, [authenticated, router]);
  return null;
}
