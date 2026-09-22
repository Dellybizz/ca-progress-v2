"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Device = { sessionId: string; current: boolean; clientKind: "web" | "mobile"; deviceLabel: string | null; lastSeenAt: string | null };

export function SessionControls() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await fetch("/api/v1/session", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return setDevices([]);
    const payload = await response.json() as { sessions?: Device[] };
    setDevices(payload.sessions || []);
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const act = async (action: "revoke_others" | "revoke_all") => {
    if (action === "revoke_all" && !window.confirm("Sign out every CA Progress session, including this device?")) return;
    setBusy(true); setNotice(null);
    const response = await fetch("/api/v1/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ action }) });
    setBusy(false);
    if (!response.ok) return setNotice("Session security action could not be completed.");
    if (action === "revoke_all") { router.push("/login"); router.refresh(); return; }
    setNotice("Other devices were signed out.");
    await load();
  };
  if (!devices.length) return <p>Sign in to review active devices.</p>;
  return <div style={{ display: "grid", gap: 10 }}>
    <p>{devices.length} active session{devices.length === 1 ? "" : "s"}. Session tokens are stored only in secure HTTP-only cookies.</p>
    <ul>{devices.map(device => <li key={device.sessionId}><strong>{device.current ? "This device" : device.deviceLabel || (device.clientKind === "mobile" ? "Mobile app" : "Web browser")}</strong>{device.lastSeenAt ? ` · active ${new Date(device.lastSeenAt).toLocaleString()}` : ""}</li>)}</ul>
    <div className="phase11-header-links"><button disabled={busy || devices.length < 2} onClick={() => void act("revoke_others")}>Sign out other devices</button><button disabled={busy} onClick={() => void act("revoke_all")}>Sign out all devices</button></div>
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
