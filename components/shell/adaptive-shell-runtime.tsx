"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

export function AdaptiveShellRuntime() {
  const [connection, setConnection] = useState<"online" | "offline" | "restored">("online");
  useEffect(() => {
    const root = document.documentElement;
    let restoreTimer = 0;
    const setViewport = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const keyboardInset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      root.style.setProperty("--app-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--keyboard-inset", `${Math.round(keyboardInset)}px`);
      root.dataset.keyboard = keyboardInset > 120 ? "open" : "closed";
      root.dataset.appDisplay = window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser";
    };
    const offline = () => { root.dataset.connection = "offline"; setConnection("offline"); };
    const online = () => { root.dataset.connection = "online"; setConnection("restored"); window.clearTimeout(restoreTimer); restoreTimer = window.setTimeout(() => setConnection("online"), 2400); };
    if (!navigator.onLine) offline(); else root.dataset.connection = "online";
    setViewport();
    window.visualViewport?.addEventListener("resize", setViewport);
    window.visualViewport?.addEventListener("scroll", setViewport);
    window.addEventListener("resize", setViewport);
    window.addEventListener("orientationchange", setViewport);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.clearTimeout(restoreTimer);
      window.visualViewport?.removeEventListener("resize", setViewport);
      window.visualViewport?.removeEventListener("scroll", setViewport);
      window.removeEventListener("resize", setViewport);
      window.removeEventListener("orientationchange", setViewport);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  if (connection === "online") return null;
  return <div className={`shell-connection shell-connection--${connection}`} role="status" aria-live="polite"><Icon name={connection === "offline" ? "cloud-off" : "check"} size={15}/><span>{connection === "offline" ? "Offline — saved changes will sync when connected" : "Back online — synchronizing changes"}</span></div>;
}
