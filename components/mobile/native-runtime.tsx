"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

const APP_ORIGINS = new Set(["https://caprogress.zanisheluxe.in", "https://ca-progress-v2.habeebaasif622.workers.dev"]);
const SAFE_PATH = /^\/(?:auth\/callback|dashboard|planner(?:\/.*)?|progress|study|notes(?:\/.*)?|resources(?:\/.*)?|community(?:\/.*)?|settings(?:\/.*)?|billing|pricing|feature-tour|privacy|account-deletion)(?:[/?#]|$)/;

function internalPath(value: string) {
  try {
    const url = new URL(value);
    if (!APP_ORIGINS.has(url.origin)) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return SAFE_PATH.test(path) ? path : null;
  } catch { return null; }
}

export function NativeRuntime() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.dataset.nativePlatform = Capacitor.getPlatform();
    const handles = [
      App.addListener("appUrlOpen", ({ url }) => { const path = internalPath(url); if (path) router.push(path); }),
      App.addListener("resume", () => { window.dispatchEvent(new Event("online")); router.refresh(); }),
      App.addListener("backButton", ({ canGoBack }) => { if (canGoBack) window.history.back(); else void App.minimizeApp(); }),
    ];
    return () => { for (const handle of handles) void handle.then((listener) => listener.remove()); };
  }, [router]);
  return null;
}
