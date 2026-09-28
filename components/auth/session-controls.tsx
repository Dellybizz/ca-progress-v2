"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Device = { sessionId: string; current: boolean; clientKind: "web" | "mobile"; deviceLabel: string | null; lastSeenAt: string | null; createdAt: string; expiresAt: string };

export function SessionControls() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const load = async () => {
    const response = await fetch("/api/v1/session", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return setDevices([]);
    const payload = await response.json() as { sessions?: Device[] };
    setDevices(payload.sessions || []);
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const act = async (action: "username" | "password" | "revoke_device" | "revoke_others" | "revoke_all", sessionId?: string) => {
    if (!currentPassword) return setNotice("Enter your current password first.");
    if (action === "password" && newPassword !== confirm) return setNotice("New passwords do not match.");
    if (action === "revoke_all" && !window.confirm("Sign out every CA Progress session, including this device?")) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(action === "username" || action === "password" || action === "revoke_device" ? "/api/v1/account-security" : "/api/v1/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, currentPassword, username, newPassword, sessionId }) });
      const payload = await response.json() as { error?: string | { message?: string } };
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : payload.error?.message || "Account security action failed.");
      setCurrentPassword(""); setNewPassword(""); setConfirm(""); setUsername("");
      if (action === "revoke_all") { router.push("/login"); router.refresh(); return; }
      setNotice(action === "password" ? "Password changed. Other devices were signed out." : action === "username" ? "Username changed. Your data stays on this account." : "Selected sessions were signed out.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Account security action failed."); }
    finally { setBusy(false); }
  };
  return <div style={{ display: "grid", gap: 16 }}>
    <p>Changes and device revocation require your current password. Your profile and study records remain on the same account.</p>
    <label>Current password<input type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/></label>
    <div className="auth-password-form"><label>New username<input autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z][A-Za-z0-9._]{2,29}" value={username} onChange={event => setUsername(event.target.value)}/></label><button type="button" disabled={busy || !username || !currentPassword} onClick={() => void act("username")}>Change username</button></div>
    <div className="auth-password-form"><label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)}/></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)}/></label><button type="button" disabled={busy || newPassword.length < 12 || !currentPassword} onClick={() => void act("password")}>Change password</button></div>
    <h3>Logged in devices</h3>
    <p>{devices.length} active session{devices.length === 1 ? "" : "s"}.</p>
    <ul>{devices.map(device => <li key={device.sessionId}><strong>{device.current ? "This device" : device.deviceLabel || (device.clientKind === "mobile" ? "Mobile app" : "Web browser")}</strong> · {device.clientKind}{device.lastSeenAt ? ` · active ${new Date(device.lastSeenAt).toLocaleString()}` : ""}{!device.current && <button type="button" disabled={busy || !currentPassword} onClick={() => void act("revoke_device", device.sessionId)}>Sign out</button>}</li>)}</ul>
    <div className="phase11-header-links"><button type="button" disabled={busy || !currentPassword || devices.length < 2} onClick={() => void act("revoke_others")}>Sign out other devices</button><button type="button" disabled={busy || !currentPassword} onClick={() => void act("revoke_all")}>Sign out all devices</button></div>
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
