import React, { useCallback, useEffect, useState } from "react";
import { MOBILE_STUDENT_FEATURES } from "../../../config/mobile-feature-parity";
import { readPeopleSnapshot, storePeopleSnapshot, type AccountSnapshot, type LocalAccountRepository, type LocalWorkspace } from "../../../packages/mobile-data/src";
import { nativeApiRequest } from "./native-auth";
import { openExternalSafely } from "./runtime";
import { attemptAppliesToSelection, type AttemptOption, type CALevel, type GroupChoice } from "../../../lib/profile/validation";

type AccountPage = "pricing" | "billing" | "tour" | "deletion";
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
const money = (amount: number | null, currency = "INR") => amount === null ? "Free" : new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100);

export function NativeAccount({ page, repository, navigate }: { page: AccountPage; repository: LocalAccountRepository | null; navigate: (route: "pricing" | "billing" | "settings") => void }) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const refresh = useCallback(async () => {
    if (!repository || !navigator.onLine) return;
    try {
      const saved = await readPeopleSnapshot<AccountSnapshot>(repository.accountId, "account");
      if (saved?.tourPending) {
        await nativeApiRequest("/api/v1/account", { method: "POST", body: JSON.stringify({ action: "tour", step: saved.tour.step, completed: Boolean(saved.tour.completedAt) }) });
      }
      const response = await nativeApiRequest("/api/v1/account") as { snapshot: AccountSnapshot };
      await storePeopleSnapshot(repository.accountId, "account", response.snapshot);
      setSnapshot(response.snapshot); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Account information could not refresh."); }
  }, [repository]);
  useEffect(() => { let active = true; if (repository) void readPeopleSnapshot<AccountSnapshot>(repository.accountId, "account").then(value => { if (active) setSnapshot(value); }); const initial = window.setTimeout(() => void refresh(), 0); const online = () => void refresh(); window.addEventListener("online", online); return () => { active = false; window.clearTimeout(initial); window.removeEventListener("online", online); }; }, [repository, refresh]);
  const action = async (payload: Record<string, unknown>) => {
    if (!navigator.onLine && payload.action === "tour" && snapshot && repository) {
      const step = Number(payload.step);
      const next: AccountSnapshot = { ...snapshot, tour: { step, completedAt: payload.completed ? new Date().toISOString() : null }, tourPending: true };
      await storePeopleSnapshot(repository.accountId, "account", next);
      setSnapshot(next); setError("Tour progress saved on this device. It will sync when connected."); return;
    }
    if (!navigator.onLine) { setError("Connect to confirm this account action."); return; }
    setBusy(true); setError("");
    try {
      const result = await nativeApiRequest("/api/v1/account", { method: "POST", body: JSON.stringify(payload) }) as { tour?: AccountSnapshot["tour"] };
      if (payload.action === "tour" && result.tour && snapshot && repository) {
        const next: AccountSnapshot = { ...snapshot, tour: result.tour, tourPending: false };
        await storePeopleSnapshot(repository.accountId, "account", next); setSnapshot(next);
      }
      await refresh(); setConfirmation("");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The server did not confirm this action."); }
    finally { setBusy(false); }
  };
  const heading = { pricing: "Plans & pricing", billing: "Subscription and payment history", tour: "Feature tour", deletion: "Delete account" }[page];
  const plan = snapshot?.billing.currentPlan;
  const openSecureCommerce = (path: "/pricing" | "/billing") => {
    if (!navigator.onLine) { setError("Connect to continue to secure account billing."); return; }
    openExternalSafely(`https://caprogress.zanisheluxe.in${path}`);
  };
  return <section className="screen account-p6"><header><p className="eyebrow">ACCOUNT</p><h1>{heading}</h1><p>{snapshot ? `Server snapshot · ${date(snapshot.fetchedAt)}${!navigator.onLine ? " · offline" : ""}` : "Connect once to save your account summary on this device."}</p></header>
    {error && <p className="core-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    {page === "pricing" && <><p>Current access: <strong>{plan?.name ?? "Waiting for account details"}</strong></p><div className="planner-p3-grid">{snapshot?.pricing.plans.map(item => <article className="planner-p3-card" key={item.id}><h2>{item.name}</h2><p>{item.tagline}</p><strong>{money(item.price_subunits, item.currency)} · {item.billing_cycle}</strong><p>{snapshot.pricing.currentPlanId === item.id ? "Current plan" : "Checkout requires a secure online session."}</p><div className="button-row"><button className="secondary" onClick={() => navigate("billing")}>View billing</button>{item.price_subunits !== null && <button className="secondary" disabled={!navigator.onLine} onClick={() => openSecureCommerce("/pricing")}>Continue on website</button>}</div></article>)}</div><p>Checkout opens the secure website and may require sign-in there. Return to the app and refresh billing to see verified access.</p></>}
    {page === "billing" && <><article className="planner-p3-card"><h2>Current plan</h2><strong>{plan?.name ?? "No verified plan saved"}</strong><p>{snapshot?.billing.currentSubscription?.status ?? "Free fallback"} · Paid through {date(snapshot?.recurring.subscription?.paidThroughAt ?? snapshot?.billing.currentSubscription?.ends_at)}</p><p>Subscription changes and purchases require a live, verified checkout. The displayed snapshot does not grant access.</p><div className="button-row"><button className="secondary" onClick={() => navigate("pricing")}>Compare plans</button><button className="secondary" disabled={!navigator.onLine} onClick={() => openSecureCommerce("/billing")}>Manage on website</button><button className="secondary" disabled={!navigator.onLine || busy} onClick={() => void refresh()}>Refresh verified state</button></div></article><article className="planner-p3-card"><h2>Renewal</h2><p>{snapshot?.recurring.subscription?.status ?? "No recurring subscription"} · {snapshot?.recurring.subscription?.financialState ?? "—"}</p><p>Next charge: {date(snapshot?.recurring.subscription?.chargeAt)}</p>{snapshot?.recurring.subscription?.cancelAtPeriodEnd && <p>Cancellation is scheduled for the end of the period.</p>}</article><div className="list section-list"><h2>Payment history</h2>{snapshot?.recurring.charges.length ? snapshot.recurring.charges.map(item => <article className="row" key={item.paymentId}><div><strong>{money(item.amountSubunits, item.currency)}</strong><small>{item.status} · {date(item.createdAt)}</small></div></article>) : <p>No recurring charges saved.</p>}</div></>}
    {page === "tour" && <><p>{snapshot?.tour.completedAt ? `Completed ${date(snapshot.tour.completedAt)}` : `Step ${Math.min((snapshot?.tour.step ?? 0) + 1, MOBILE_STUDENT_FEATURES.length)} of ${MOBILE_STUDENT_FEATURES.length}`}{snapshot?.tourPending ? " · pending sync" : ""}</p><div className="planner-p3-card"><h2>{MOBILE_STUDENT_FEATURES[Math.min(snapshot?.tour.step ?? 0, MOBILE_STUDENT_FEATURES.length - 1)].label}</h2><p>{MOBILE_STUDENT_FEATURES[Math.min(snapshot?.tour.step ?? 0, MOBILE_STUDENT_FEATURES.length - 1)].mobileLayout}</p><div className="button-row"><button className="secondary" disabled={busy || !snapshot?.tour.step} onClick={() => void action({ action: "tour", step: Math.max(0, (snapshot?.tour.step ?? 0) - 1), completed: false })}>Previous</button><button className="primary" disabled={busy || !snapshot} onClick={() => void action({ action: "tour", step: Math.min((snapshot?.tour.step ?? 0) + 1, MOBILE_STUDENT_FEATURES.length), completed: (snapshot?.tour.step ?? 0) + 1 >= MOBILE_STUDENT_FEATURES.length })}>{(snapshot?.tour.step ?? 0) >= MOBILE_STUDENT_FEATURES.length - 1 ? "Finish" : "Next"}</button></div><p>Progress is saved locally when offline and synchronized when connected.</p></div></>}
    {page === "deletion" && <article className="planner-p3-card"><h2>Account deletion</h2><p>Deletion is scheduled on the server after a seven day period. Removing offline files from this phone is a separate action in Settings.</p>{snapshot?.deletion?.status === "scheduled" ? <><p role="status">Scheduled for {date(snapshot.deletion.scheduled_for)}.</p><button className="secondary" disabled={busy || !navigator.onLine} onClick={() => void action({ action: "cancelDeletion" })}>Cancel scheduled deletion</button></> : <form className="p6-delete-form" onSubmit={event => { event.preventDefault(); if (window.confirm("Schedule deletion of your CA Progress account and server data?")) void action({ action: "delete", confirmation }); }}><label>Type DELETE MY ACCOUNT to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off"/></label><button className="secondary" disabled={busy || !navigator.onLine || confirmation !== "DELETE MY ACCOUNT"}>Schedule deletion</button></form>}<p>{!navigator.onLine ? "Connect to confirm account deletion or cancellation." : "Only the server can confirm this action."}</p></article>}
  </section>;
}

export function NativeProfileEditor({ workspace, repository }: { workspace: LocalWorkspace; repository: LocalAccountRepository | null }) {
  const profile = workspace.profile;
  const [name, setName] = useState(profile.displayName);
  const [level, setLevel] = useState(profile.level ?? "");
  const [group, setGroup] = useState(profile.group ?? "");
  const [attempt, setAttempt] = useState(profile.attempt ?? "");
  const [target, setTarget] = useState(profile.dailyTargetMinutes ?? 120);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [attemptOptions, setAttemptOptions] = useState<AttemptOption[]>(workspace.academic.attempts);
  useEffect(() => { const timer = window.setTimeout(() => { if (navigator.onLine) void nativeApiRequest("/api/v1/profile").then(value => setAttemptOptions((value as { attempts: AttemptOption[] }).attempts)).catch(() => undefined); }, 0); return () => window.clearTimeout(timer); }, []);
  const save = async () => {
    if (!repository || !navigator.onLine) { setMessage("Connect to save your profile."); return; }
    if (workspace.pending) { setMessage("Synchronize pending study edits before updating academic context."); return; }
    setBusy(true); setMessage("");
    try {
      await nativeApiRequest("/api/v1/profile", { method: "POST", body: JSON.stringify({ displayName: name.trim(), level, group: level === "foundation" ? "not_applicable" : group, attemptKey: attempt, dailyTargetMinutes: target }) });
      window.dispatchEvent(new Event("ca-sync")); setMessage("Profile saved on the server. Refreshing this device…");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Profile could not be saved."); }
    finally { setBusy(false); }
  };
  return <section className="screen account-p6"><header><p className="eyebrow">PROFILE & ATTEMPT</p><h1>{profile.displayName}</h1><p>Your saved identity and academic selection.</p></header><form className="p6-profile-form" onSubmit={event => { event.preventDefault(); void save(); }}><label>Display name<input value={name} maxLength={80} onChange={event => setName(event.target.value)} required/></label><label>CA level<select value={level} required onChange={event => { setLevel(event.target.value); setGroup(""); setAttempt(""); }}><option value="">Choose level</option><option value="foundation">Foundation</option><option value="intermediate">Intermediate</option><option value="final">Final</option></select></label>{level !== "foundation" && <label>Group<select value={group} required onChange={event => { setGroup(event.target.value); setAttempt(""); }}><option value="">Choose group</option><option value="group_1">Group 1</option><option value="group_2">Group 2</option><option value="both">Both groups</option></select></label>}<label>Attempt<select value={attempt} required onChange={event => setAttempt(event.target.value)}><option value="">Choose attempt</option>{attemptOptions.filter(item => level && attemptAppliesToSelection(item, level as CALevel, (level === "foundation" ? "not_applicable" : group) as GroupChoice)).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Daily study target (minutes)<input type="number" min="15" max="720" value={target} onChange={event => setTarget(Number(event.target.value))}/></label><button className="primary" disabled={busy || !navigator.onLine || !name.trim() || !attempt || !level || (level !== "foundation" && !group)}>Save profile</button>{workspace.pending > 0 && <p>Synchronize pending edits before changing your academic context.</p>}{message && <p role="status">{message}</p>}</form></section>;
}
