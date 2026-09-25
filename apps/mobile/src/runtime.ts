import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export const CANONICAL_ORIGINS = new Set(["https://caprogress.zanisheluxe.in", "https://ca-progress-v2.habeebaasif622.workers.dev"]);
export const SAFE_DEEP_LINK = /^\/(?:auth\/callback|dashboard|planner(?:\/.*)?|progress|study|community(?:\/.*)?|resources(?:\/.*)?|notifications(?:\/.*)?|settings(?:\/.*)?)(?:[/?#]|$)/;
const NATIVE_AUTH_CALLBACK = "ca-progress://auth/complete";

export type NativeRoute = "dashboard" | "today" | "progress" | "syllabus" | "planner" | "focus" | "notes" | "activity" | "buddy" | "community" | "resources" | "notifications" | "profile" | "settings";

export function routeFromDeepLink(value: string): NativeRoute | null {
  try {
    const url = new URL(value);
    if (!CANONICAL_ORIGINS.has(url.origin) || !SAFE_DEEP_LINK.test(`${url.pathname}${url.search}${url.hash}`)) return null;
    if (url.pathname.startsWith("/progress")) return "progress";
    if (url.pathname.startsWith("/planner/today")) return "today";
    if (url.pathname.startsWith("/planner")) return "planner";
    if (url.pathname.startsWith("/study")) return "focus";
    if (url.pathname.startsWith("/community")) return "community";
    if (url.pathname.startsWith("/resources")) return "resources";
    if (url.pathname.startsWith("/notifications")) return "notifications";
    if (url.pathname.startsWith("/settings")) return "settings";
    return "dashboard";
  } catch { return null; }
}

export function installNativeRuntime(onRoute: (route: NativeRoute) => void, onResume: () => void, onAuthCallback: (url: string) => void) {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  document.documentElement.dataset.nativePlatform = Capacitor.getPlatform();

  // Android may recreate the activity when the browser returns from OAuth. In
  // that cold-launch path appUrlOpen can fire before the web bundle has added
  // its listener, so recover the launch URL as well as listening for live URLs.
  // Keep one callback URL one-use locally because the server exchange is also
  // one-use and a URL can occasionally be observed through both Capacitor APIs.
  const handledAuthCallbacks = new Set<string>();
  const handleIncomingUrl = (url: string) => {
    if (url.startsWith(NATIVE_AUTH_CALLBACK)) {
      if (handledAuthCallbacks.has(url)) return;
      handledAuthCallbacks.add(url);
      onAuthCallback(url);
      return;
    }
    const route = routeFromDeepLink(url);
    if (route) onRoute(route);
  };

  const handles = [
    App.addListener("appUrlOpen", ({ url }) => handleIncomingUrl(url)),
    App.addListener("resume", onResume),
    App.addListener("backButton", ({ canGoBack }) => { if (canGoBack) history.back(); else void App.minimizeApp(); }),
  ];

  // getLaunchUrl is required for OAuth callbacks that launched/re-launched the
  // native activity before appUrlOpen registration completed.
  void App.getLaunchUrl().then((launch) => { if (launch?.url) handleIncomingUrl(launch.url); });

  return () => { for (const handle of handles) void handle.then((listener) => listener.remove()); };
}

export function openExternalSafely(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only secure external links are allowed.");
  window.open(url.href, "_system", "noopener,noreferrer");
}
