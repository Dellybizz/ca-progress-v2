"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getOrCreateGuestIdentity } from "@/lib/auth/guest";

type Status = { tone: "info" | "danger" | "success"; message: string } | null;

export function LoginPanel({ next, initialError, initialNotice }: { next: string; initialError?: string | null; initialNotice?: string | null }) {
  const router = useRouter();
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState<"guest" | null>(null);
  const [status] = useState<Status>(initialError ? { tone: "danger", message: initialError } : initialNotice ? { tone: "success", message: initialNotice } : null);
  const googleHref = useMemo(() => `/auth/google?next=${encodeURIComponent(next)}&remember=${remember ? "true" : "false"}`, [next, remember]);
  const linkedinHref = useMemo(() => `/auth/linkedin?next=${encodeURIComponent(next)}&remember=${remember ? "true" : "false"}`, [next, remember]);

  function continueAsGuest() {
    setLoading("guest");
    getOrCreateGuestIdentity();
    router.push(next);
    router.refresh();
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
            <p>Choose Google or LinkedIn to sign in to your synced account.</p>
          </div>

          {status ? <div className={`auth-status auth-status--${status.tone}`} role="status" aria-live="polite">{status.message}</div> : null}

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
          <Button size="lg" variant="ghost" isLoading={loading === "guest"} onClick={continueAsGuest}>Continue as Guest <Icon name="arrow" size={16} /></Button>
          <p className="auth-terms">Guest mode stays on this browser and does not create synced private records. You can sign in later when you want cross-device access.</p>
        </CardBody>
      </Card>
    </div>
  );
}
