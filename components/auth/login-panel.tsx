"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { getOrCreateGuestIdentity } from "@/lib/auth/guest";

type Status = { tone: "info" | "danger" | "success"; message: string } | null;

export function LoginPanel({ next, initialError }: { next: string; initialError?: string | null }) {
  const router = useRouter();
  const [remember, setRemember] = useState(true);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState<"request" | "verify" | "guest" | null>(null);
  const [status, setStatus] = useState<Status>(initialError ? { tone: "danger", message: initialError } : null);
  const googleHref = useMemo(() => `/auth/google?next=${encodeURIComponent(next)}&remember=${remember ? "true" : "false"}`, [next, remember]);

  async function requestOtp() {
    setLoading("request"); setStatus(null);
    const response = await fetch("/api/auth/phone/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    setLoading(null);
    if (!response.ok || !result.ok) return setStatus({ tone: "danger", message: result.error || "Could not send OTP." });
    setOtpSent(true); setStatus({ tone: "success", message: "OTP sent. Enter the code from your SMS." });
  }

  async function verifyOtp() {
    setLoading("verify"); setStatus(null);
    const response = await fetch("/api/auth/phone/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, token: otp, remember, next }) });
    const result = await response.json() as { ok?: boolean; error?: string; next?: string };
    setLoading(null);
    if (!response.ok || !result.ok || !result.next) return setStatus({ tone: "danger", message: result.error || "Could not verify OTP." });
    router.push(result.next); router.refresh();
  }

  function continueAsGuest() {
    setLoading("guest");
    getOrCreateGuestIdentity();
    router.push(next); router.refresh();
  }

  return <div className="auth-v2-layout"><section className="auth-v2-intro"><Badge tone="brand">Phase 2 identity</Badge><h1>Sign in when you need sync. Study as a guest when you don’t.</h1><p>Authenticated accounts sync private profile data through Supabase RLS. Guest mode stays on this browser and never creates a private database record.</p><div className="auth-trust-list"><div><Icon name="shield"/><span><strong>Server-verified sessions</strong><small>Identity is available to Server Components before hydration.</small></span></div><div><Icon name="target"/><span><strong>One-time onboarding</strong><small>Resume where you left off until setup is complete.</small></span></div><div><Icon name="layers"/><span><strong>Private by default</strong><small>Your profile and preferences are scoped to your user ID.</small></span></div></div></section><Card className="auth-v2-card"><CardBody><div className="auth-v2-card__heading"><span className="eyebrow">Welcome</span><h2>Continue to CA Progress</h2><p>Choose the sign-in method that fits you.</p></div>{status ? <div className={`auth-status auth-status--${status.tone}`} role="status" aria-live="polite">{status.message}</div> : null}<a className="ui-button ui-button--primary ui-button--lg auth-google" href={googleHref}><span className="provider-mark">G</span><span>Continue with Google</span></a><div className="auth-divider"><span>or use phone OTP</span></div><div className="auth-phone-stack"><Input label="Phone number" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} hint="Include the country code. OTP requests are rate limited."/>{otpSent ? <Input label="One-time password" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter OTP" value={otp} onChange={(event) => setOtp(event.target.value)} /> : null}{otpSent ? <Button size="lg" isLoading={loading === "verify"} onClick={verifyOtp}>Verify & continue</Button> : <Button size="lg" variant="secondary" isLoading={loading === "request"} onClick={requestOtp}>Send OTP</Button>}</div><label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)}/><span><strong>Remember this device</strong><small>On: stay signed in using the refresh session. Off: auth cookies become browser-session cookies.</small></span></label><div className="auth-divider"><span>or</span></div><Button size="lg" variant="ghost" isLoading={loading === "guest"} onClick={continueAsGuest}>Continue as Guest <Icon name="arrow" size={16}/></Button><p className="auth-terms">Guest progress is intentionally not written to private V2 tables. Sign in later when a feature requires persistence or cross-device sync.</p></CardBody></Card></div>;
}
