"use client";

import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "unconfigured" | "blocked" | "off" | "on";

function applicationKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function BrowserPushControls() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    void fetch("/api/push/subscriptions", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { configured?: boolean; publicKey?: string | null };
      if (!response.ok || !payload.configured || !payload.publicKey) { setState("unconfigured"); return; }
      setPublicKey(payload.publicKey);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(Notification.permission === "denied" ? "blocked" : subscription ? "on" : "off");
    }).catch(() => setState("unconfigured"));
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true); setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "blocked" : "off"); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) });
      const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) { await subscription.unsubscribe(); throw new Error("Push subscription could not be saved."); }
      setState("on");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Push notifications could not be enabled."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch { setError("Push notifications could not be disabled."); }
    finally { setBusy(false); }
  }

  if (state === "loading") return <p>Checking this device’s notification support…</p>;
  if (state === "unsupported") return <p>This browser does not support app push notifications.</p>;
  if (state === "unconfigured") return <p>App push delivery is not enabled on this deployment yet.</p>;
  if (state === "blocked") return <p>Notifications are blocked in this device’s browser settings.</p>;
  return <div className="planner-push-controls"><p>{state === "on" ? "Push notifications are enabled on this device." : "Receive selected reminders when the app is not open."}</p><button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={() => void (state === "on" ? disable() : enable())}>{busy ? "Updating…" : state === "on" ? "Turn off on this device" : "Enable on this device"}</button>{error ? <div className="phase6-inline-error">{error}</div> : null}</div>;
}
