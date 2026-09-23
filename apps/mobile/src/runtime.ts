import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export const CANONICAL_ORIGINS = new Set(["https://caprogress.zanisheluxe.in", "https://ca-progress-v2.habeebaasif622.workers.dev"]);
export const SAFE_DEEP_LINK = /^\/(?:auth\/callback|dashboard|planner(?:\/.*)?|progress|study|community(?:\/.*)?|settings(?:\/.*)?)(?:[/?#]|$)/;

export type NativeRoute = "today" | "progress" | "planner" | "focus" | "community" | "settings";

export function routeFromDeepLink(value: string): NativeRoute | null {
  try {
    const url = new URL(value);
    if (!CANONICAL_ORIGINS.has(url.origin) || !SAFE_DEEP_LINK.test(`${url.pathname}${url.search}${url.hash}`)) return null;
    if (url.pathname.startsWith("/progress")) return "progress";
    if (url.pathname.startsWith("/planner")) return "planner";
    if (url.pathname.startsWith("/study")) return "focus";
    if (url.pathname.startsWith("/community")) return "community";
    if (url.pathname.startsWith("/settings")) return "settings";
    return "today";
  } catch { return null; }
}

export function installNativeRuntime(onRoute: (route: NativeRoute) => void, onResume: () => void, onAuthCallback: (url: string) => void) {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  document.documentElement.dataset.nativePlatform = Capacitor.getPlatform();
  const handles = [
    App.addListener("appUrlOpen", ({ url }) => { if (url.startsWith("ca-progress://auth/complete")) onAuthCallback(url); else { const route = routeFromDeepLink(url); if (route) onRoute(route); } }),
    App.addListener("resume", onResume),
    App.addListener("backButton", ({ canGoBack }) => { if (canGoBack) history.back(); else void App.minimizeApp(); }),
  ];
  return () => { for (const handle of handles) void handle.then((listener) => listener.remove()); };
}

export function openExternalSafely(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only secure external links are allowed.");
  window.open(url.href, "_system", "noopener,noreferrer");
}
