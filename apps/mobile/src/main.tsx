import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MOBILE_BUILD } from "./build";
import { clearLocalAccount, hasRetainedLocalAccount, localPreview, readLocalAccount, retainLocalAccount } from "./repository";
import { installNativeRuntime, type NativeRoute } from "./runtime";
import { completeNativeSignIn, logoutNative, nativeApiRequest, readNativeSession, revokeOtherDevices, startNativeSignIn, type NativeSessionSnapshot } from "./native-auth";
import { createSyncCoordinator, openAccountRepository, wipeAllOfflineData, type LocalAccountRepository, type LocalDashboard, type LocalTimer, type SyncVisualState } from "../../../packages/mobile-data/src";
import "./styles.css";

const navigation: Array<{ route: NativeRoute; label: string; glyph: string }> = [
  { route: "today", label: "Today", glyph: "●" },
  { route: "progress", label: "Progress", glyph: "◒" },
  { route: "planner", label: "Planner", glyph: "□" },
  { route: "focus", label: "Focus", glyph: "◉" },
  { route: "community", label: "Community", glyph: "◌" },
  { route: "settings", label: "Settings", glyph: "◇" },
];

function routeFromHash(): NativeRoute {
  const value = location.hash.replace(/^#\/?/, "");
  return navigation.some((item) => item.route === value) ? value as NativeRoute : "today";
}

function navigate(route: NativeRoute) {
  history.pushState({ route }, "", `#/${route}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Status({ online, state, refresh }: { online: boolean; state:SyncVisualState; refresh:()=>void }) {
  const text=state==="updating"?"Updating…":!online||state==="offline"?"Offline · showing saved data":state==="pending"?"Pending edits":state==="conflict"?"Review conflict":state==="failed"?"Update paused":"Ready";
  return <button className={`status ${online ? "online" : "offline"}`} onClick={refresh}>{text}</button>;
}

function Today({ dashboard }: { dashboard: LocalDashboard }) {
  return <section className="screen"><header><p className="eyebrow">Tuesday · Local workspace</p><h1>Good afternoon</h1><p>Saved information appears immediately; future synchronization updates it quietly.</p></header><div className="hero-card"><div><span className="card-label">NEXT UP</span><h2>Build today’s study plan</h2><p>The installed layout and local records remain available offline.</p></div><button onClick={() => navigate("planner")}>Open planner</button></div><h2 className="section-title">Today</h2><div className="list">{dashboard.today.map((item) => <article className="row" key={item.title}><span className="check"/><div><strong>{item.title}</strong><small>{item.meta}</small></div><span className="pill">{item.state}</span></article>)}</div></section>;
}

function Progress({ dashboard }: { dashboard: LocalDashboard }) {
  return <section className="screen"><header><p className="eyebrow">LOCAL SNAPSHOT</p><h1>Progress</h1><p>Your academic structure and completed stages render from device storage.</p></header><div className="metric-grid"><article><small>Overall progress</small><strong>{dashboard.progress.value}</strong><p>{dashboard.progress.hint}</p></article><article><small>Study streak</small><strong>0 days</strong><p>Starts after your first synchronized session.</p></article></div><div className="empty"><span>◒</span><h2>Progress is ready for data</h2><p>The screen stays usable offline.</p></div></section>;
}

function Planner() {
  return <section className="screen"><header><p className="eyebrow">LOCAL PLAN</p><h1>Planner</h1><p>Tasks will appear from the local database first and update quietly in the background.</p></header><div className="date-strip">{["M 21", "T 22", "W 23", "T 24", "F 25"].map((day, index) => <button className={index === 2 ? "selected" : ""} key={day}>{day}</button>)}</div><div className="empty compact"><span>□</span><h2>No local tasks yet</h2><p>This is a stable empty state, not a network loading screen.</p></div></section>;
}

function Focus({ repository }: { repository: LocalAccountRepository | null }) {
  const [timer, setTimer] = useState<LocalTimer>({ mode: "focus", status: "idle", startedAt: null, elapsedSeconds: 0, updatedAt: new Date().toISOString() });
  useEffect(() => { void repository?.readTimer().then(setTimer); }, [repository]);
  const toggle = async () => { const running=timer.status==="running"; const next={...timer,status:running?"paused" as const:"running" as const,startedAt:running?timer.startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};setTimer(next);await repository?.saveTimer(next); };
  return <section className="screen focus-screen"><header><p className="eyebrow">DEVICE TIMER</p><h1>Focus</h1><p>The timer state is stored locally and survives closing or restarting the app.</p></header><div className={`timer ${timer.status === "running" ? "running" : ""}`}><span>25:00</span><small>{timer.status === "running" ? "FOCUSING" : timer.status.toUpperCase()}</small></div><button className="primary wide" onClick={() => void toggle()}>{timer.status === "running" ? "Pause focus" : "Start focus"}</button><p className="note">Timer persistence is account-scoped and does not require a connection.</p></section>;
}

function Community({ dashboard }: { dashboard: LocalDashboard }) {
  return <section className="screen"><header><p className="eyebrow">RECENT CHANNELS</p><h1>Community</h1><p>Channels and recent messages open from SQLite before realtime updates arrive.</p></header><div className="list">{dashboard.community.map((item) => <article className="row channel" key={item.channel}><span className="avatar">#</span><div><strong>{item.channel}</strong><small>{item.preview}</small></div><span className="time">{item.time}</span></article>)}</div><div className="stale-banner">No connection is required to keep saved history visible.</div></section>;
}

function Settings({ authenticated, repository, recovered, onLogout, onRemove, onWipe }: { authenticated: boolean; repository: LocalAccountRepository|null; recovered:boolean; onLogout: () => Promise<void>; onRemove:()=>Promise<void>; onWipe:()=>Promise<void> }) {
  const [message, setMessage] = useState("");
  return <section className="screen"><header><p className="eyebrow">THIS DEVICE</p><h1>Settings</h1><p>Secure sessions and offline records remain explicit and account-scoped.</p></header><div className="settings-list"><button><span>Account on this device</span><small>{authenticated ? "Secure native session" : "Local preview"}</small></button>{authenticated && <button onClick={() => void revokeOtherDevices().then(() => setMessage("Other device sessions were revoked.")).catch((error) => setMessage(error.message))}><span>Revoke other devices</span><small>Keep this phone signed in</small></button>}<button><span>Offline storage</span><small>{repository ? `${recovered ? "Recovered · " : ""}SQLite schema ${MOBILE_BUILD.localSchemaVersion}` : "Preview memory"}</small></button><button><span>Application build</span><small>{MOBILE_BUILD.channel} · {MOBILE_BUILD.build}</small></button>{authenticated && <button onClick={() => void onLogout()}><span>Sign out and lock local data</span><small>Revokes token; saved records remain locked</small></button>}<button onClick={() => void onRemove()}><span>Remove this account from device</span><small>Deletes only this account’s offline records</small></button><button onClick={() => void onWipe()}><span>Wipe all offline data</span><small>Deletes every local account and cache</small></button></div>{message && <p className="note">{message}</p>}</section>;
}

const defaultDashboard: LocalDashboard = { today: [...localPreview.today], progress: localPreview.progress[0], community: [...localPreview.community] };

function Bootstrap({ onContinue }: { onContinue: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const signIn = (provider: "google" | "linkedin_oidc") => { setBusy(true); setError(""); void startNativeSignIn(provider).catch((cause) => { setBusy(false); setError(cause.message); }); };
  return <div className="bootstrap"><div className="bootstrap-card"><span className="bootstrap-logo">CA</span><p className="eyebrow">INSTALLED WORKSPACE</p><h1>CA Progress is ready</h1><p>The application interface is stored on this device. Sign in securely to use the same account and cloud data as the website.</p><button className="primary" disabled={busy} onClick={() => signIn("google")}>Continue with Google</button><button className="secondary" disabled={busy} onClick={() => signIn("linkedin_oidc")}>Continue with LinkedIn</button><button className="secondary" disabled={busy} onClick={onContinue}>Open local preview</button>{error && <small>{error}</small>}<small>Your password and session token never pass through this screen.</small></div></div>;
}

function AppShell() {
  const [route, setRoute] = useState<NativeRoute>(routeFromHash);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncVisualState>("idle");
  const [account, setAccount] = useState(readLocalAccount);
  const [authenticated, setAuthenticated] = useState(false);
  const [selected, setSelected] = useState(hasRetainedLocalAccount);
  const [repository, setRepository] = useState<LocalAccountRepository|null>(null);
  const [dashboard, setDashboard] = useState<LocalDashboard>(defaultDashboard);
  const applySession = (value: NativeSessionSnapshot | null) => { if (!value?.authenticated) return; const next = { id: value.user?.applicationUserId || "cloud-account", displayName: value.user?.displayName || value.user?.email || "CA Progress student", subtitle: value.user?.email || "Cloud account" }; setAccount(next); retainLocalAccount(next); setAuthenticated(true); setSelected(true); };

  useEffect(() => {
    const changed = () => setRoute(routeFromHash());
    const connected = () => {setOnline(true);window.dispatchEvent(new Event("ca-sync"));};
    const disconnected = () => setOnline(false);
    const resume = () => window.dispatchEvent(new Event("ca-sync"));
    addEventListener("popstate", changed);
    addEventListener("online", connected);
    addEventListener("offline", disconnected);
    const removeNative = installNativeRuntime(navigate, resume, (url) => { void completeNativeSignIn(url).then(applySession).catch(() => setSelected(false)); });
    const retainedAccountId=readLocalAccount().id;
    void readNativeSession().then((value) => { if (value) applySession(value); else if (retainedAccountId !== "local-preview") { clearLocalAccount(); setSelected(false); } }).catch(() => { if (retainedAccountId !== "local-preview") { clearLocalAccount(); setSelected(false); } });
    // Network compatibility checks begin after the bundled shell has painted.
    requestAnimationFrame(() => document.documentElement.dataset.shellReady = "true");
    return () => { removeEventListener("popstate", changed); removeEventListener("online", connected); removeEventListener("offline", disconnected); removeNative(); };
  }, []);

  useEffect(() => { if(!selected||(account.id!=="local-preview"&&!authenticated))return; let active=true;let remove:()=>void=()=>{};void openAccountRepository(account,authenticated).then(async(value)=>{if(!active||!value)return;setRepository(value);setDashboard(await value.readDashboard());remove=value.subscribe(()=>{void value.readDashboard().then(setDashboard);});}).catch(()=>setRepository(null));return()=>{active=false;remove();}; }, [selected,account,authenticated]);

  useEffect(()=>{if(!authenticated||!repository)return;const coordinator=createSyncCoordinator({accountId:account.id,transport:nativeApiRequest,onState:setSyncState});const sync=()=>{void coordinator.synchronize().catch(()=>undefined);};window.addEventListener("ca-sync",sync);window.addEventListener("ca-realtime-invalidation",sync);const periodic=window.setInterval(sync,15*60*1000);sync();return()=>{coordinator.stop();window.clearInterval(periodic);window.removeEventListener("ca-sync",sync);window.removeEventListener("ca-realtime-invalidation",sync);};},[authenticated,repository,account.id]);

  if (!selected) return <Bootstrap onContinue={() => { retainLocalAccount(account); setSelected(true); }} />;
  const reset=()=>{clearLocalAccount();setRepository(null);setAuthenticated(false);setSelected(false);};
  const content = route === "settings" ? <Settings authenticated={authenticated} repository={repository} recovered={Boolean(repository?.database.recovered)} onLogout={async()=>{await repository?.lock();await logoutNative();reset();}} onRemove={async()=>{await repository?.removeFromDevice();reset();}} onWipe={async()=>{await wipeAllOfflineData();reset();}} /> : route === "today" ? <Today dashboard={dashboard}/> : route === "progress" ? <Progress dashboard={dashboard}/> : route === "focus" ? <Focus repository={repository}/> : route === "community" ? <Community dashboard={dashboard}/> : <Planner/>;
  return <div className="app-shell"><aside><div className="brand"><span>CA</span><div><strong>CA Progress</strong><small>Native workspace</small></div></div><nav>{navigation.map((item) => <button className={route === item.route ? "active" : ""} onClick={() => navigate(item.route)} key={item.route}><i>{item.glyph}</i>{item.label}</button>)}</nav><div className="account"><span>Z</span><div><strong>{account.displayName}</strong><small>{account.subtitle}</small></div></div></aside><main><div className="topbar"><div className="mobile-brand"><span>CA</span><strong>CA Progress</strong></div><Status online={online} state={syncState} refresh={()=>window.dispatchEvent(new Event("ca-sync"))}/></div>{content}</main><nav className="bottom-nav">{navigation.slice(0, 5).map((item) => <button className={route === item.route ? "active" : ""} onClick={() => navigate(item.route)} key={item.route}><i>{item.glyph}</i><span>{item.label}</span></button>)}<button className={route === "settings" ? "active" : ""} onClick={() => navigate("settings")}><i>◇</i><span>More</span></button></nav></div>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Mobile application root is missing.");
createRoot(root).render(<React.StrictMode><AppShell /></React.StrictMode>);
