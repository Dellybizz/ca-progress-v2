"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const key = `ca-progress:phase6-timezone:${timezone}`;
    if (window.sessionStorage.getItem(key) === "1") return;
    let cancelled = false;
    void fetch("/api/study/timezone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timezone }), keepalive: true }).then((response) => {
      if (!response.ok || cancelled) return;
      window.sessionStorage.setItem(key, "1");
      router.refresh();
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [router]);
  return null;
}
