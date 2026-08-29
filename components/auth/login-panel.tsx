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
  const [loading, setLoading] = useState<"guest" | null>(null);
  const [status] = useState<Status>(initialError ? { tone: "danger", message: initialError } : null);
  const googleHref = useMemo(() => `/auth/google?next=${encodeURIComponent(next)}&remember=${remember ? "true" : "false"}`, [next, remember]);
  const linkedinHref = useMemo(() => `/auth/linkedin?next=${encodeURIComponent(next)}&remember=${remember ? "true" : "false"}`, [next, remember]);

  function continueAsGuest() {
    setLoading("guest");
    getOrCreateGuestIdentity();
    router.push(next);
    router.refresh();
  }

  return <div className="auth-v2-layout"><section className="auth-v2-intro"><Badge tone="brand">Phase 2 identity</Badge><h1>Sign in when you need sync. Study as a guest when you don’t.</h1><p>Authenticated accounts sync private profile data through Supabase RLS. Guest mode stays on this browser and never creates a private database record.</p><div className="auth-trust-list"><div><Icon name="shield"/><span><strong>Server-verified sessions</strong><small>Identity is available to Server Components before hydration.</small></span></div><div><Icon name="target"/><span><strong>One-time onboarding</strong><small>Resume where you left off until setup is complete.</small></span></div><div><Icon name="layers"/><span><strong>Private by default</strong><small>Your profile and preferences are scoped to your user ID.</small></span></div></div></section><Card className="auth-v2-card"><CardBody><div className="auth-v2-card__heading"><span className="eyebrow">Welcome</span><h2>Continue to CA Progress</h2><p>Choose Google or LinkedIn to create a synced account.</p></div>{status ? <div className={`auth-status auth-status--${status.tone}`} role="status" aria-live="polite">{status.message}</div> : null}<a className="ui-button ui-button--primary ui-button--lg auth-google" href={googleHref}><span className="provider-mark">G</span><span>Continue with Google</span></a><div className="auth-divider"><span>or</span></div><a className="ui-button ui-button--secondary ui-button--lg auth-google" href={linkedinHref}><span className="provider-mark">in</span><span>Continue with LinkedIn</span></a><label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)}/><span><strong>Remember this device</strong><small>On: stay signed in using the refresh session. Off: auth cookies become browser-session cookies.</small></span></label><div className="auth-divider"><span>or continue without an account</span></div><Button size="lg" variant="ghost" isLoading={loading === "guest"} onClick={continueAsGuest}>Continue as Guest <Icon name="arrow" size={16}/></Button><p className="auth-terms">Guest progress is intentionally not written to private V2 tables. Sign in later when a feature requires persistence or cross-device sync.</p></CardBody></Card></div>;
}
