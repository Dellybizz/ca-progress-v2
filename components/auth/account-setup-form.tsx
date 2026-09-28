"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export function AccountSetupForm({ assignedUsername, next, profileName }: { assignedUsername: string; next: string; profileName: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState(assignedUsername);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/account-setup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not finish setup.");
      setPassword(""); setConfirm(""); router.push(next); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish setup."); }
    finally { setBusy(false); }
  }
  return <div className="settings-v2-page"><Card><CardHeader title="Set up your CA Progress login" description="Your study data remains on this account. Choose a username and password for future sign-ins."/><CardBody>
    <p>Your assigned username is <strong>{assignedUsername}</strong>. You can keep it or choose one you prefer.</p>
    <p>{profileName ? `Profile name: ${profileName}. ` : ""}Review your profile separately after setting up your login.</p>
    {error && <p className="auth-status auth-status--danger" role="alert">{error}</p>}
    <form onSubmit={event => void submit(event)} className="auth-password-form">
      <label>Username<input autoComplete="username" value={username} required minLength={3} maxLength={30} pattern="[A-Za-z][A-Za-z0-9._]{2,29}" onChange={event => setUsername(event.target.value)}/></label>
      <label>New password<input type="password" autoComplete="new-password" value={password} required minLength={12} maxLength={128} onChange={event => setPassword(event.target.value)}/></label>
      <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} required minLength={12} maxLength={128} onChange={event => setConfirm(event.target.value)}/></label>
      <button className="ui-button ui-button--primary ui-button--md" type="submit" disabled={busy}>{busy ? "Saving…" : "Save username and password"}</button>
    </form>
    <p><Link href="/settings/profile">Review profile details</Link> · <Link href={next}>Do this later</Link></p>
  </CardBody></Card></div>;
}
