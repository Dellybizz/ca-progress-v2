"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getOrCreateGuestIdentity } from "@/lib/auth/guest";

type Status = { tone: "info" | "danger" | "success"; message: string } | null;

export function LoginPanel({ next, initialError }: { next: string; initialError?: string | null }) {
  const router = useRouter();
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState<"guest" | "password" | null>(null);
  const [status, setStatus] = useState<Status>(initialError ? { tone: "danger", message: initialError } : null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [create, setCreate] = useState(false);
  const googleHref = useMemo(() => `/auth/google?next=${encodeURIComponent(next)}&remember=${remember ? "true" : "false"}`, [next, remember]);
  const linkedinHref = useMemo(() => `/auth/linkedin?next=${encodeURIComponent(next)}&remember=${remember ? "true" : "false"}`, [next, remember]);

  async function continueAsGuest() {
    setLoading("guest");
    const response = await fetch("/api/v1/offline/context", { cache: "no-store", credentials: "same-origin" });
    const context = response.ok ? await response.json() as { guestId?: string } : null;
    getOrCreateGuestIdentity(context?.guestId ?? null);
    router.push(next);
    router.refresh();
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("password"); setStatus(null);
    try {
      const response = await fetch("/api/v1/password-auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: create ? "register" : "login", username, password, remember }) });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Sign-in failed.");
      setPassword(""); router.push(next); router.refresh();
    } catch (error) { setStatus({ tone: "danger", message: error instanceof Error ? error.message : "Sign-in failed." }); }
    finally { setLoading(null); }
  }

  return (
    <div className="auth-v2-layout">
      <section className="auth-v2-intro">
        <Badge tone="brand">Secure access</Badge>
        <h1>Your CA Progress, synced when you need it.</h1>
        <p>Sign in to keep your profile and settings synced across devices, or continue as a guest for local access on this browser.</p>
        <div className="auth-trust-list">
          <div><Icon name="shield" /><span><strong>Secure sessions</strong><small>Your account is verified before private data is loaded.</small></span></div>
          <div><Icon name="target" /><span><strong>One-time setup</strong><small>Complete your CA level, group and attempt once, then continue where you left off.</small></span></div>
          <div><Icon name="layers" /><span><strong>Private by default</strong><small>Your synced profile and preferences stay scoped to your account.</small></span></div>
        </div>
      </section>

      <Card className="auth-v2-card">
        <CardBody>
          <div className="auth-v2-card__heading">
            <span className="eyebrow">Welcome</span>
            <h2>Continue to CA Progress</h2>
            <p>Use your username, Google, or LinkedIn to access your synced account.</p>
          </div>

          {status ? <div className={`auth-status auth-status--${status.tone}`} role="status" aria-live="polite">{status.message}</div> : null}

          <form onSubmit={event => void submitPassword(event)} className="auth-password-form">
            <h3>{create ? "Create an account" : "Sign in with username"}</h3>
            <label>Username<input autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z][A-Za-z0-9._]{2,29}" value={username} onChange={event => setUsername(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete={create ? "new-password" : "current-password"} required minLength={create ? 12 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
            {create && <small>Use at least 12 characters. Password recovery is not available yet; save your password securely.</small>}
            <Button size="lg" isLoading={loading === "password"} type="submit">{create ? "Create account" : "Sign in"}</Button>
            <button type="button" className="auth-switch" onClick={() => { setCreate(!create); setStatus(null); setPassword(""); }}>{create ? "Already have an account? Sign in" : "Create a username account"}</button>
          </form>

          <div className="auth-divider"><span>or sign in with</span></div>

          <a className="ui-button ui-button--primary ui-button--lg auth-google" href={googleHref}>
            <span className="provider-mark">G</span><span>Continue with Google</span>
          </a>
          <div className="auth-divider"><span>or</span></div>
          <a className="ui-button ui-button--secondary ui-button--lg auth-google" href={linkedinHref}>
            <span className="provider-mark">in</span><span>Continue with LinkedIn</span>
          </a>

          <label className="remember-row">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span><strong>Remember this device</strong><small>Keep me signed in on this browser. Turn this off on shared devices.</small></span>
          </label>

          <div className="auth-divider"><span>or continue without an account</span></div>
          <Button size="lg" variant="ghost" isLoading={loading === "guest"} onClick={() => void continueAsGuest()}>Continue as Guest <Icon name="arrow" size={16} /></Button>
          <p className="auth-terms">Guest mode stays on this browser and does not create synced private records. You can sign in later when you want cross-device access.</p>
        </CardBody>
      </Card>
    </div>
  );
}
