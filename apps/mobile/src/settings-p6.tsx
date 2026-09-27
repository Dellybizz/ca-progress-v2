import React, { useCallback, useEffect, useState } from "react";
import { AppearanceControls } from "../../../components/preferences/appearance-controls";
import { FocusPreferences } from "../../../components/preferences/focus-preferences";
import { canUseExport } from "../../../lib/exports/policy.mjs";
import { readPeopleSnapshot, storePeopleSnapshot, type AccountSnapshot, type StudyProfilePrivacy, type LocalAccountRepository } from "../../../packages/mobile-data/src";
import { nativeApiRequest } from "./native-auth";
import { openExternalSafely } from "./runtime";

export type SettingsPage = "appearance" | "focusSettings" | "security" | "exports" | "offlineStorage" | "privacy";
type Device = { sessionId: string; current: boolean; clientKind: string; deviceLabel: string | null; lastSeenAt: string | null };

export function NativeSettingsDetail({ page, repository, onSignOut, onRemove, onWipe }: { page: SettingsPage; repository: LocalAccountRepository | null; onSignOut: () => Promise<void>; onRemove: () => Promise<void>; onWipe: () => Promise<void> }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [privacy, setPrivacy] = useState<StudyProfilePrivacy | null>(null);
  const [buddyId, setBuddyId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const loadDevices = useCallback(async () => {
    if (!navigator.onLine) return;
    try { const response = await nativeApiRequest("/api/v1/session") as { sessions: Device[] }; setDevices(response.sessions); setMessage(""); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Devices could not be loaded."); }
  }, []);
  useEffect(() => {
    if (page === "security") { const initial = window.setTimeout(() => void loadDevices(), 0); return () => window.clearTimeout(initial); }
    if (page === "exports" && repository) { let active = true; void readPeopleSnapshot<AccountSnapshot>(repository.accountId, "account").then(value => { if (active) setAccount(value); }); return () => { active = false; }; }
    if (page === "privacy" && repository) { let active = true; void readPeopleSnapshot<StudyProfilePrivacy>(repository.accountId, "privacy").then(value => { if (active) setPrivacy(value); }); const initial = window.setTimeout(() => { if (navigator.onLine) void nativeApiRequest("/api/v1/study-profile").then(async value => { const settings = (value as { settings: StudyProfilePrivacy }).settings; await storePeopleSnapshot(repository.accountId, "privacy", settings); if (active) setPrivacy(settings); }).catch(cause => { if (active) setMessage(cause instanceof Error ? cause.message : "Privacy settings could not refresh."); }); }, 0); return () => { active = false; window.clearTimeout(initial); }; }
  }, [page, repository, loadDevices]);
  const revokeOthers = async () => {
    if (!navigator.onLine) { setMessage("Connect to revoke other sessions."); return; }
    setBusy(true);
    try { await nativeApiRequest("/api/v1/session", { method: "POST", body: JSON.stringify({ action: "revoke_others" }) }); await loadDevices(); setMessage("Other sessions were revoked by the server."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not revoke other sessions."); }
    finally { setBusy(false); }
  };
  const savePrivacy = async () => {
    if (!privacy || !repository || !navigator.onLine) { setMessage("Connect to save Study Profile privacy."); return; }
    setBusy(true); setMessage("");
    try { const response = await nativeApiRequest("/api/v1/study-profile", { method: "PATCH", body: JSON.stringify(privacy) }) as { settings: StudyProfilePrivacy }; await storePeopleSnapshot(repository.accountId, "privacy", response.settings); setPrivacy(response.settings); setMessage("Study Profile privacy saved on the server."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Privacy was not saved."); }
    finally { setBusy(false); }
  };
  const changeBuddy = async (id: string, method: "POST" | "DELETE") => {
    if (!repository || !navigator.onLine) { setMessage("Connect to change buddy access."); return; }
    setBusy(true); setMessage("");
    try { const response = await nativeApiRequest("/api/v1/study-profile/buddies", { method, body: JSON.stringify({ buddyUserId: id }) }) as { settings: StudyProfilePrivacy }; await storePeopleSnapshot(repository.accountId, "privacy", response.settings); setPrivacy(response.settings); setBuddyId(""); setMessage("Buddy access was updated on the server."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Buddy access was not changed."); }
    finally { setBusy(false); }
  };
  const title = { appearance: "Appearance", focusSettings: "Focus preferences", security: "Security & devices", exports: "Data export", offlineStorage: "Offline storage", privacy: "Study Profile privacy" }[page];
  const tier = account?.billing.currentPlan?.tier_key ?? "free";
  const exports = [
    { label: "Progress PDF", path: "/api/exports/progress", feature: "progress_pdf" },
    { label: "Study CSV", path: "/api/exports/study", feature: "study_csv" },
    { label: "Test history CSV", path: "/api/exports/tests", feature: "test_history_csv" },
    { label: "Full backup", path: "/api/exports/backup", feature: "full_backup" },
  ] as const;
  const openExport = (path: string) => {
    if (!navigator.onLine) { setMessage("Connect to request a fresh export."); return; }
    openExternalSafely(`https://caprogress.zanisheluxe.in${path}`);
  };
  return <section className="screen settings-p6"><header><p className="eyebrow">SETTINGS</p><h1>{title}</h1></header>
    {page === "appearance" && <article className="planner-p3-card"><p>Choose how CA Progress looks and moves on this device.</p><AppearanceControls/></article>}
    {page === "focusSettings" && <article className="planner-p3-card"><p>Choose what happens when a Focus session finishes on this device.</p><FocusPreferences/></article>}
    {page === "security" && <article className="planner-p3-card"><h2>Active sessions</h2><p>Session details load live and are not stored offline.</p>{devices.length ? <ul>{devices.map(item => <li key={item.sessionId}><strong>{item.current ? "This device" : item.deviceLabel || item.clientKind}</strong>{item.lastSeenAt ? ` · active ${new Date(item.lastSeenAt).toLocaleString("en-IN")}` : ""}</li>)}</ul> : <p>{navigator.onLine ? "No session details loaded yet." : "Connect to review devices."}</p>}<div className="button-row"><button className="secondary" disabled={!navigator.onLine || busy} onClick={() => void loadDevices()}>Refresh devices</button><button className="secondary" disabled={!navigator.onLine || busy || devices.length < 2} onClick={() => void revokeOthers()}>Sign out other devices</button><button className="secondary" onClick={() => { if (window.confirm("Sign out this device and lock its saved records?")) void onSignOut().catch(cause => setMessage(cause instanceof Error ? cause.message : "Could not sign out.")); }}>Sign out this device</button></div></article>}
    {page === "exports" && <article className="planner-p3-card"><h2>{account?.billing.currentPlan?.name ?? "Saved plan not available"}</h2><p>Exports are generated by the server with your current entitlement. Open the secure website to download; you may need to sign in there.</p><div className="settings-p6-exports">{exports.map(item => <button className="secondary" key={item.path} disabled={!navigator.onLine || !account || !canUseExport(tier, item.feature)} onClick={() => openExport(item.path)}>{item.label}{account && !canUseExport(tier, item.feature) ? " · plan required" : ""}</button>)}</div></article>}
    {page === "offlineStorage" && <article className="planner-p3-card"><h2>Saved on this device</h2><p>Account data and selected files remain isolated by signed-in account. Removing an account from this phone does not request deletion from the server.</p><div className="button-row"><button className="secondary" onClick={() => { if (window.confirm("Remove this account and its saved offline files from this device?")) void onRemove().catch(cause => setMessage(cause instanceof Error ? cause.message : "Could not remove local data.")); }}>Remove this account</button><button className="secondary" onClick={() => { if (window.confirm("Wipe offline data for every account on this device? This cannot be undone.")) void onWipe().catch(cause => setMessage(cause instanceof Error ? cause.message : "Could not wipe local data.")); }}>Wipe all offline data</button></div></article>}
    {page === "privacy" && <><article className="planner-p3-card"><h2>Study Profile privacy</h2><p>Private by default. Every outward-facing academic field is checked again on the server.</p>{privacy ? <form className="settings-p6-privacy" onSubmit={event => { event.preventDefault(); void savePrivacy(); }}><label>Public bio<textarea maxLength={240} value={privacy.publicBio} onChange={event => setPrivacy(current => current && { ...current, publicBio: event.target.value })}/></label>{([ ["profileVisibility", "Profile visibility"], ["progressVisibility", "Progress visibility"], ["streakVisibility", "Streak visibility"] ] as const).map(([key, label]) => <label key={key}>{label}<select value={privacy[key]} onChange={event => setPrivacy(current => current && { ...current, [key]: event.target.value as StudyProfilePrivacy[typeof key] })}><option value="private">Private — only me</option><option value="buddies">Study buddies</option><option value="public">Public profile link</option></select></label>)}<label><input type="checkbox" checked={privacy.showLevel} onChange={event => setPrivacy(current => current && { ...current, showLevel: event.target.checked })}/> Show CA level</label><label><input type="checkbox" checked={privacy.showAttempt} onChange={event => setPrivacy(current => current && { ...current, showAttempt: event.target.checked })}/> Show target attempt</label><button className="primary" disabled={busy || !navigator.onLine}>Save privacy</button></form> : <p>Connect once to load your saved privacy controls.</p>}</article><article className="planner-p3-card"><h2>Allowed study buddies</h2><p>Grant visibility by exact CA Progress user ID.</p><form className="settings-p6-privacy" onSubmit={event => { event.preventDefault(); void changeBuddy(buddyId.trim(), "POST"); }}><input value={buddyId} maxLength={128} placeholder="Buddy user ID" onChange={event => setBuddyId(event.target.value)} aria-label="Buddy user ID"/><button className="secondary" disabled={busy || !navigator.onLine || !buddyId.trim()}>Allow buddy</button></form>{privacy?.buddyUserIds.map(id => <div className="settings-p6-buddy" key={id}><code>{id}</code><button className="secondary" disabled={busy || !navigator.onLine} onClick={() => void changeBuddy(id, "DELETE")}>Remove</button></div>)}</article></>}
    {message && <p className="core-error" role="status">{message}</p>}
  </section>;
}
