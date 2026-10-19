"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Notice = "install" | "ios" | "update" | null;

export function PwaRuntime({ releaseVersion }: { releaseVersion: string }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const activationRequested = useRef(false);
  const reloaded = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    let interval = 0;
    let iosNoticeTimer = 0;
    const dismissalKey = `ca-progress:pwa-install-dismissed:${releaseVersion}`;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (cancelled || standalone) return;
      setInstallPrompt(event as InstallPrompt);
      if (!localStorage.getItem(dismissalKey)) setNotice(current => current === "update" ? current : "install");
    };
    const onInstalled = () => { setInstallPrompt(null); setNotice(null); localStorage.removeItem(dismissalKey); };
    const onControllerChange = () => {
      if (!activationRequested.current || reloaded.current) return;
      reloaded.current = true;
      window.location.reload();
    };
    const watch = (value: ServiceWorkerRegistration) => {
      setRegistration(value);
      if (value.waiting && navigator.serviceWorker.controller) setNotice("update");
      value.addEventListener("updatefound", () => {
        const worker = value.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setNotice("update");
        });
      });
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(value => {
      if (cancelled) return;
      watch(value);
      void value.update();
      interval = window.setInterval(() => void value.update(), 30 * 60 * 1000);
    }).catch(() => undefined);
    if (!standalone && ios && !localStorage.getItem(dismissalKey)) iosNoticeTimer = window.setTimeout(() => setNotice("ios"), 0);
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void navigator.serviceWorker.getRegistration().then(value => value?.update());
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(iosNoticeTimer);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [releaseVersion]);

  const dismiss = () => {
    localStorage.setItem(`ca-progress:pwa-install-dismissed:${releaseVersion}`, "1");
    setNotice(null);
  };
  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") dismiss();
  };
  const activate = () => {
    const waiting = registration?.waiting;
    if (!waiting) { void registration?.update(); return; }
    activationRequested.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  if (!notice) return null;
  const updating = notice === "update";
  return <aside className="pwa-notice" aria-live="polite" aria-label={updating ? "Application update available" : "Install CA Progress"}>
    <div className="pwa-notice__copy">
      <strong>{updating ? "CA Progress is ready to update" : notice === "ios" ? "Add CA Progress to your Home Screen" : "Install CA Progress"}</strong>
      <span>{updating ? "Reload once to use the latest site features." : notice === "ios" ? "Tap Share, then Add to Home Screen. Your account and cloud data stay the same." : "Open it like an app while keeping the same account and cloud data."}</span>
    </div>
    <div className="pwa-notice__actions">
      {updating ? <Button size="sm" onClick={activate}>Update now</Button> : notice === "install" ? <Button size="sm" onClick={() => void install()}>Install</Button> : null}
      {!updating ? <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button> : null}
    </div>
  </aside>;
}
