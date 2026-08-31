"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

export function DeleteAccountPanel({ identityLabel, blockedReason }: { identityLabel: string; blockedReason: "parent_owner" | "sole_owner" | null }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockedMessage = blockedReason === "parent_owner"
    ? "This account is the Parent Owner. Transfer Parent Owner access before deleting it."
    : blockedReason === "sole_owner"
      ? "This is the only active Owner account. Add another Owner first so the workspace cannot lose administrative control."
      : null;

  async function deleteAccount() {
    if (confirmation !== "DELETE" || blockedReason) return;
    setDeleting(true);
    setError(null);
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; redirect?: string } | null;
    setDeleting(false);
    if (!response.ok || !result?.ok) {
      setError(result?.error || "We could not delete your account right now.");
      return;
    }
    router.replace(result.redirect || "/login?deleted=1");
    router.refresh();
  }

  return <div className="delete-account-v2">
    <Card className="delete-account-v2__card"><CardBody>
      <span className="delete-account-v2__icon"><Icon name="shield" size={28}/></span>
      <div className="delete-account-v2__heading">
        <span>Account & privacy</span>
        <h1>Delete your CA Progress account?</h1>
        <p>This permanently removes your sign-in account and data directly tied to it. Shared moderation or security records may be retained where the platform needs them for integrity and abuse prevention.</p>
      </div>
      <div className="delete-account-v2__identity"><strong>{identityLabel}</strong><small>This is the account that will be deleted.</small></div>
      {blockedMessage ? <div className="auth-status auth-status--danger" role="alert">{blockedMessage}</div> : <>
        <div className="delete-account-v2__warning"><Icon name="lock" size={19}/><div><strong>This cannot be undone</strong><p>You will lose access to saved progress, planner data, study history, private notes, uploads and account settings linked to this account.</p></div></div>
        <Input label="Type DELETE to confirm" value={confirmation} autoComplete="off" spellCheck={false} onChange={(event) => setConfirmation(event.target.value)} hint="Use uppercase DELETE."/>
      </>}
      {error ? <div className="auth-status auth-status--danger" role="alert">{error}</div> : null}
      <div className="delete-account-v2__actions">
        <Link className="ui-button ui-button--secondary ui-button--lg" href="/settings">Keep my account</Link>
        <Button variant="danger" size="lg" disabled={confirmation !== "DELETE" || Boolean(blockedReason)} isLoading={deleting} onClick={deleteAccount}>Delete account permanently</Button>
      </div>
    </CardBody></Card>
  </div>;
}
