import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MOBILE_BUILD } from "./build";
import { hasRetainedLocalAccount, localPreview, readLocalAccount, retainLocalAccount } from "./repository";
import { installNativeRuntime, type NativeRoute } from "./runtime";
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

function Status({ online, syncing }: { online: boolean; syncing: boolean }) {
  return <span className={`status ${online ? "online" : "offline"}`}>{syncing ? "Updating…" : online ? "Ready" : "Offline · showing saved data"}</span>;
}

function Today() {
  return <section className="screen"><header><p className="eyebrow">Tuesday · Local workspace</p><h1>Good afternoon</h1><p>Start with what matters. Your synchronized plan will update here without replacing this screen.</p></header><div className="hero-card"><div><span className="card-label">NEXT UP</span><h2>Build today’s study plan</h2><p>Phase 17 will keep tasks synchronized. The installed layout is already available offline.</p></div><button onClick={() => navigate("planner")}>Open planner</button></div><h2 className="section-title">Today</h2><div className="list">{localPreview.today.map((item) => <article className="row" key={item.title}><span className="check"/><div><strong>{item.title}</strong><small>{item.meta}</small></div><span className="pill">{item.state}</span></article>)}</div></section>;
}

function Progress() {
  return <section className="screen"><header><p className="eyebrow">LOCAL SNAPSHOT</p><h1>Progress</h1><p>Your academic structure and completed stages will render from device storage.</p></header><div className="metric-grid"><article><small>Overall progress</small><strong>{localPreview.progress[0].value}</strong><p>{localPreview.progress[0].hint}</p></article><article><small>Study streak</small><strong>0 days</strong><p>Starts after your first synchronized session.</p></article></div><div className="empty"><span>◒</span><h2>Progress is ready for data</h2><p>The screen stays usable offline; secure account synchronization is added in later phases.</p></div></section>;
}

function Planner() {
  return <section className="screen"><header><p className="eyebrow">LOCAL PLAN</p><h1>Planner</h1><p>Tasks will appear from the local database first and update quietly in the background.</p></header><div className="date-strip">{["M 21", "T 22", "W 23", "T 24", "F 25"].map((day, index) => <button className={index === 2 ? "selected" : ""} key={day}>{day}</button>)}</div><div className="empty compact"><span>□</span><h2>No local tasks yet</h2><p>This is a stable empty state, not a network loading screen.</p></div></section>;
}

function Focus() {
  const [running, setRunning] = useState(false);
  return <section className="screen focus-screen"><header><p className="eyebrow">DEVICE TIMER</p><h1>Focus</h1><p>The timer interface is bundled and remains available without a connection.</p></header><div className={`timer ${running ? "running" : ""}`}><span>25:00</span><small>{running ? "FOCUSING" : "READY"}</small></div><button className="primary wide" onClick={() => setRunning(!running)}>{running ? "Pause focus" : "Start focus"}</button><p className="note">Phase 16 persists timer state across process death; this foundation intentionally stores no study record yet.</p></section>;
}

function Community() {
  return <section className="screen"><header><p className="eyebrow">RECENT CHANNELS</p><h1>Community</h1><p>Channels and recent messages will open from SQLite before realtime updates arrive.</p></header><div className="list">{localPreview.community.map((item) => <article className="row channel" key={item.channel}><span className="avatar">#</span><div><strong>{item.channel}</strong><small>{item.preview}</small></div><span className="time">{item.time}</span></article>)}</div><div className="stale-banner">No connection is required to keep this frame and saved history visible.</div></section>;
}

function Settings() {
  return <section className="screen"><header><p className="eyebrow">THIS DEVICE</p><h1>Settings</h1><p>Local storage and account controls remain explicit and account-scoped.</p></header><div className="settings-list"><button><span>Account on this device</span><small>Local preview</small></button><button><span>Offline storage</span><small>Shell only · schema {MOBILE_BUILD.localSchemaVersion}</small></button><button><span>Application build</span><small>{MOBILE_BUILD.channel} · {MOBILE_BUILD.build}</small></button><button><span>Compatibility</span><small>API v{MOBILE_BUILD.apiVersion}</small></button></div></section>;
}

const screens: Record<NativeRoute, React.ComponentType> = { today: Today, progress: Progress, planner: Planner, focus: Focus, community: Community, settings: Settings };

function Bootstrap({ onContinue }: { onContinue: () => void }) {
  return <div className="bootstrap"><div className="bootstrap-card"><span className="bootstrap-logo">CA</span><p className="eyebrow">INSTALLED WORKSPACE</p><h1>CA Progress is ready</h1><p>The application interface is stored on this device. Open a local preview now; secure account sign-in and cloud data arrive in Phase 15.</p><button className="primary" onClick={onContinue}>Continue on this device</button><button className="secondary" disabled>Sign in · available after secure session upgrade</button><small>No website is loaded to show this screen.</small></div></div>;
}

function AppShell() {
  const [route, setRoute] = useState<NativeRoute>(routeFromHash);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [account] = useState(readLocalAccount);
  const [selected, setSelected] = useState(hasRetainedLocalAccount);
  const Screen = screens[route];

  useEffect(() => {
    const changed = () => setRoute(routeFromHash());
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    const resume = () => { setSyncing(true); window.setTimeout(() => setSyncing(false), 500); };
    addEventListener("popstate", changed);
    addEventListener("online", connected);
    addEventListener("offline", disconnected);
    const removeNative = installNativeRuntime(navigate, resume);
    // Network compatibility checks begin after the bundled shell has painted.
    requestAnimationFrame(() => document.documentElement.dataset.shellReady = "true");
    return () => { removeEventListener("popstate", changed); removeEventListener("online", connected); removeEventListener("offline", disconnected); removeNative(); };
  }, []);

  if (!selected) return <Bootstrap onContinue={() => { retainLocalAccount(account); setSelected(true); }} />;
  return <div className="app-shell"><aside><div className="brand"><span>CA</span><div><strong>CA Progress</strong><small>Native workspace</small></div></div><nav>{navigation.map((item) => <button className={route === item.route ? "active" : ""} onClick={() => navigate(item.route)} key={item.route}><i>{item.glyph}</i>{item.label}</button>)}</nav><div className="account"><span>Z</span><div><strong>{account.displayName}</strong><small>{account.subtitle}</small></div></div></aside><main><div className="topbar"><div className="mobile-brand"><span>CA</span><strong>CA Progress</strong></div><Status online={online} syncing={syncing}/></div><Screen /></main><nav className="bottom-nav">{navigation.slice(0, 5).map((item) => <button className={route === item.route ? "active" : ""} onClick={() => navigate(item.route)} key={item.route}><i>{item.glyph}</i><span>{item.label}</span></button>)}<button className={route === "settings" ? "active" : ""} onClick={() => navigate("settings")}><i>◇</i><span>More</span></button></nav></div>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Mobile application root is missing.");
createRoot(root).render(<React.StrictMode><AppShell /></React.StrictMode>);
