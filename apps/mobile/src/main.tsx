import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MOBILE_BUILD } from "./build";
import { clearLocalAccount, hasRetainedLocalAccount, localPreview, readLocalAccount, retainLocalAccount } from "./repository";
import { installNativeRuntime, type NativeRoute } from "./runtime";
import { completeNativeSignIn, logoutNative, nativeApiRequest, readNativeSession, revokeOtherDevices, startNativeSignIn, type NativeSessionSnapshot } from "./native-auth";
import { createSyncCoordinator, openAccountRepository, wipeAllOfflineData, type LocalAccountRepository, type LocalDashboard, type LocalTimer, type LocalWorkspace, type SyncVisualState } from "../../../packages/mobile-data/src";
import "./styles.css";

const navigation: Array<{ route: NativeRoute; label: string; glyph: string }> = [
  { route: "today", label: "Today", glyph: "●" },
  { route: "progress", label: "Progress", glyph: "◒" },
  { route: "syllabus", label: "Syllabus", glyph: "§" },
  { route: "planner", label: "Planner", glyph: "□" },
  { route: "focus", label: "Focus", glyph: "◉" },
  { route: "notes", label: "Notes", glyph: "▤" },
  { route: "activity", label: "Activity", glyph: "↗" },
  { route: "buddy", label: "Study Buddy", glyph: "◎" },
  { route: "profile", label: "Profile", glyph: "◇" },
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

function Today({ workspace, repository }: { workspace:LocalWorkspace;repository:LocalAccountRepository|null }) {
  const tasks=workspace.planner.filter(item=>!item.completedAt).slice(0,6);
  return <section className="screen"><header><p className="eyebrow">{workspace.academic.attempt} · Saved workspace</p><h1>Good afternoon</h1><p>{workspace.lastSyncedAt?`Updated ${new Date(workspace.lastSyncedAt).toLocaleString()}`:"Ready offline — sync when you sign in."}</p></header><div className="hero-card"><div><span className="card-label">NEXT UP</span><h2>{tasks[0]?.title||"Build today’s study plan"}</h2><p>{tasks[0]?.dueAt?new Date(tasks[0].dueAt).toLocaleString():"Your installed workspace is ready without a page load."}</p></div><button onClick={() => navigate(tasks.length?"focus":"planner")}>{tasks.length?"Start focus":"Open planner"}</button></div><h2 className="section-title">Today</h2><div className="list">{tasks.length?tasks.map(item=><article className="row" key={item.localId}><button aria-label={`Complete ${item.title}`} className={`check ${item.completedAt?"done":""}`} onClick={()=>void repository?.toggleTask(item.localId,!item.completedAt)}/><div><strong>{item.title}</strong><small>{item.dueAt?new Date(item.dueAt).toLocaleString():"Flexible task"}</small></div><span className="pill">{item.state}</span></article>):<StableEmpty icon="●" title="Nothing planned yet" text="Add a task; it will be saved on this device immediately."/>}</div></section>;
}

function StableEmpty({icon,title,text}:{icon:string;title:string;text:string}){return <div className="empty compact"><span>{icon}</span><h2>{title}</h2><p>{text}</p></div>;}

function Progress({ workspace,repository }: {workspace:LocalWorkspace;repository:LocalAccountRepository|null}) {
  const completed=workspace.progress.filter(item=>Boolean(item.payload.completedAt)).length;const total=workspace.progress.length;
  return <section className="screen"><header><p className="eyebrow">{workspace.academic.level} · {workspace.academic.attempt}</p><h1>Progress</h1><p>Your saved syllabus opens instantly and updates in place.</p></header><div className="metric-grid"><article><small>First coverage</small><strong>{total?`${Math.round(completed/total*100)}%`:"—"}</strong><p>{completed} of {total} synchronized chapters</p></article><article><small>Pending edits</small><strong>{workspace.pending}</strong><p>Retained until safely synchronized.</p></article></div>{total?<div className="list section-list">{workspace.progress.map(item=><article className="row" key={item.localId}><button className={`check ${item.payload.completedAt?"done":""}`} aria-label={`Toggle ${item.title}`} onClick={()=>void repository?.setProgressStage(item.localId,"completed",!item.payload.completedAt)}/><div><strong>{item.title}</strong><small>{item.understanding==null?"Understanding not rated":`${item.understanding}% understanding`}</small></div><span className="pill">{item.state}</span></article>)}</div>:<StableEmpty icon="◒" title="No synchronized syllabus yet" text="This stable screen remains usable while the first sync is unavailable."/>}</section>;
}

function Planner({workspace,repository}:{workspace:LocalWorkspace;repository:LocalAccountRepository|null}) {
  const [title,setTitle]=useState("");const add=async()=>{if(!title.trim()||!repository)return;await repository.createTask(title,new Date(Date.now()+86400000).toISOString());setTitle("");window.dispatchEvent(new Event("ca-sync"));};
  return <section className="screen"><header><p className="eyebrow">LOCAL PLAN</p><h1>Planner</h1><p>Changes appear immediately and remain queued through app restarts.</p></header><form className="quick-add" onSubmit={event=>{event.preventDefault();void add();}}><input value={title} onChange={event=>setTitle(event.target.value)} placeholder="Add a study task" aria-label="Task title"/><button className="primary" type="submit">Add task</button></form>{workspace.planner.length?<div className="list section-list">{workspace.planner.map(item=><article className="row" key={item.localId}><button className={`check ${item.completedAt?"done":""}`} aria-label={`Toggle ${item.title}`} onClick={()=>void repository?.toggleTask(item.localId,!item.completedAt)}/><div><strong>{item.title}</strong><small>{item.dueAt?new Date(item.dueAt).toLocaleString():"Flexible"}</small></div><span className="pill">{item.state}</span></article>)}</div>:<StableEmpty icon="□" title="No local tasks yet" text="Add one above; no connection is required."/>}</section>;
}

function Focus({ repository }: { repository: LocalAccountRepository | null }) {
  const [timer, setTimer] = useState<LocalTimer>({ mode: "focus", status: "idle", startedAt: null, elapsedSeconds: 0, updatedAt: new Date().toISOString() });
  const [clock,setClock]=useState(()=>Date.now());
  const [reviewSession,setReviewSession]=useState<string|null>(null);const[understanding,setUnderstanding]=useState(70);const[focusRating,setFocusRating]=useState<"poor"|"okay"|"focused">("focused");
  useEffect(() => { void repository?.readTimer().then(setTimer); }, [repository]);
  useEffect(()=>{const handle=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(handle);},[]);
  const toggle = async () => { const running=timer.status==="running",timestamp=new Date().toISOString(),accrued=timer.elapsedSeconds+(running&&timer.startedAt?Math.max(0,Math.floor((Date.parse(timestamp)-Date.parse(timer.startedAt))/1000)):0); const next={...timer,status:running?"paused" as const:"running" as const,startedAt:running?timer.startedAt:timestamp,elapsedSeconds:running?accrued:timer.elapsedSeconds,updatedAt:timestamp};setTimer(next);await repository?.saveTimer(next); };
  const finish=async()=>{if(!repository)return;const session=await repository.finishTimer(timer);setTimer(await repository.readTimer());setReviewSession(session);window.dispatchEvent(new Event("ca-sync"));};
  const review=async()=>{if(!repository||!reviewSession)return;await repository.saveSessionReview(reviewSession,understanding,focusRating);setReviewSession(null);window.dispatchEvent(new Event("ca-sync"));};
  const elapsed=timer.elapsedSeconds+(timer.status==="running"&&timer.startedAt?Math.max(0,Math.floor((clock-Date.parse(timer.startedAt))/1000)):0);const display=`${String(Math.floor(elapsed/60)).padStart(2,"0")}:${String(elapsed%60).padStart(2,"0")}`;
  return <section className="screen focus-screen"><header><p className="eyebrow">DEVICE TIMER</p><h1>Focus</h1><p>The timer survives closing or restarting the app.</p></header><div className={`timer ${timer.status === "running" ? "running" : ""}`}><span>{display}</span><small>{timer.status === "running" ? "FOCUSING" : timer.status.toUpperCase()}</small></div><div className="button-row"><button className="primary wide" onClick={() => void toggle()}>{timer.status === "running" ? "Pause focus" : "Start focus"}</button>{timer.status!=="idle"&&<button className="secondary wide" onClick={()=>void finish()}>Finish session</button>}</div>{reviewSession&&<div className="review-card"><h2>How was this session?</h2><label>Understanding <strong>{understanding}%</strong><input type="range" min="0" max="100" value={understanding} onChange={event=>setUnderstanding(Number(event.target.value))}/></label><div className="button-row">{(["poor","okay","focused"] as const).map(value=><button className={focusRating===value?"primary":"secondary"} onClick={()=>setFocusRating(value)} key={value}>{value}</button>)}</div><button className="primary wide" onClick={()=>void review()}>Save reflection</button></div>}<p className="note">Completion and reflection are saved locally and queued before success is shown.</p></section>;
}

function Notes({workspace,repository}:{workspace:LocalWorkspace;repository:LocalAccountRepository|null}){const[title,setTitle]=useState("");const[body,setBody]=useState("");const save=async()=>{if(!repository||!title.trim()||!body.trim())return;await repository.saveNote({title,body});setTitle("");setBody("");window.dispatchEvent(new Event("ca-sync"));};return <section className="screen"><header><p className="eyebrow">LOCAL NOTES</p><h1>Notes</h1><p>Drafts are committed to SQLite and the outbox together.</p></header><form className="note-editor" onSubmit={event=>{event.preventDefault();void save();}}><input value={title} onChange={event=>setTitle(event.target.value)} placeholder="Note title"/><textarea value={body} onChange={event=>setBody(event.target.value)} placeholder="Write your note…"/><button className="primary">Save note</button></form>{workspace.notes.length?<div className="list section-list">{workspace.notes.map(note=><article className="row note-row" key={note.localId}><div><strong>{note.title}</strong><small>{note.body.slice(0,100)||"Empty note"}</small></div><span className="pill">{note.state}</span></article>)}</div>:<StableEmpty icon="▤" title="No notes saved" text="Create a note above, even in airplane mode."/>}</section>}

function Syllabus({workspace}:{workspace:LocalWorkspace}){return <section className="screen"><header><p className="eyebrow">ACADEMIC CONTEXT</p><h1>Syllabus</h1><p>{workspace.academic.level} · {workspace.academic.attempt}</p></header>{workspace.academic.subjects.length?<div className="list">{workspace.academic.subjects.map(subject=><article className="row" key={subject.id}><span className="avatar">§</span><div><strong>{subject.title}</strong><small>Saved academic catalog</small></div></article>)}</div>:<StableEmpty icon="§" title="No catalog saved yet" text="The first successful sync will store your subjects here."/>}</section>}

function Activity({workspace}:{workspace:LocalWorkspace}){return <section className="screen"><header><p className="eyebrow">ACTIVITY & XP</p><h1>Activity</h1><p>Leaderboard and XP evidence are read from device storage.</p></header><div className="metric-grid"><article><small>XP</small><strong>{workspace.leaderboard.score}</strong><p>Recorded study evidence</p></article><article><small>Rank</small><strong>{workspace.leaderboard.rank?`#${workspace.leaderboard.rank}`:"—"}</strong><p>{workspace.leaderboard.category}</p></article></div>{workspace.activity.length?<div className="list section-list">{workspace.activity.map(item=><article className="row" key={item.id}><span className="avatar">+{item.xp}</span><div><strong>{item.title.replaceAll("_"," ")}</strong><small>{new Date(item.occurredAt).toLocaleString()}</small></div></article>)}</div>:<StableEmpty icon="↗" title="No activity saved yet" text="Completed synchronized study will appear here."/>}</section>}

function Buddy({workspace}:{workspace:LocalWorkspace}){return <section className="screen"><header><p className="eyebrow">STUDY BUDDY</p><h1>Accountability</h1><p>Saved relationships remain visible offline; online actions resume when connected.</p></header>{workspace.buddies.length?<div className="list">{workspace.buddies.map(buddy=><article className="row" key={buddy.id}><span className="avatar">◎</span><div><strong>{buddy.name}</strong><small>{buddy.state}</small></div></article>)}</div>:<StableEmpty icon="◎" title="No Study Buddy saved" text="Find and manage buddies from the website until this device synchronizes one."/>}</section>}

function Profile({workspace}:{workspace:LocalWorkspace}){const p=workspace.profile;return <section className="screen"><header><p className="eyebrow">PROFILE & ATTEMPT</p><h1>{p.displayName}</h1><p>Your saved identity and academic selection.</p></header><div className="settings-list"><button><span>CA level</span><small>{p.level||"Not selected"}</small></button><button><span>Attempt</span><small>{p.attempt||"Not selected"}</small></button><button><span>Timezone</span><small>{p.timezone||"Asia/Kolkata"}</small></button><button><span>Daily target</span><small>{p.dailyTargetMinutes?`${p.dailyTargetMinutes} minutes`:"Not set"}</small></button></div></section>}

function Community({ dashboard }: { dashboard: LocalDashboard }) {
  return <section className="screen"><header><p className="eyebrow">RECENT CHANNELS</p><h1>Community</h1><p>Channels and recent messages open from SQLite before realtime updates arrive.</p></header><div className="list">{dashboard.community.map((item) => <article className="row channel" key={item.channel}><span className="avatar">#</span><div><strong>{item.channel}</strong><small>{item.preview}</small></div><span className="time">{item.time}</span></article>)}</div><div className="stale-banner">No connection is required to keep saved history visible.</div></section>;
}

function Settings({ authenticated, repository, recovered, onLogout, onRemove, onWipe }: { authenticated: boolean; repository: LocalAccountRepository|null; recovered:boolean; onLogout: () => Promise<void>; onRemove:()=>Promise<void>; onWipe:()=>Promise<void> }) {
  const [message, setMessage] = useState("");
  return <section className="screen"><header><p className="eyebrow">MORE & SETTINGS</p><h1>Settings</h1><p>Secure sessions and offline records remain explicit and account-scoped.</p></header><div className="settings-list route-list"><button onClick={()=>navigate("syllabus")}><span>Syllabus</span><small>Academic catalog</small></button><button onClick={()=>navigate("notes")}><span>Notes</span><small>Offline drafts</small></button><button onClick={()=>navigate("activity")}><span>Activity and leaderboard</span><small>XP evidence</small></button><button onClick={()=>navigate("buddy")}><span>Study Buddy</span><small>Saved accountability</small></button><button onClick={()=>navigate("profile")}><span>Profile and attempt</span><small>Academic settings</small></button><button><span>Account on this device</span><small>{authenticated ? "Secure native session" : "Local preview"}</small></button>{authenticated && <button onClick={() => void revokeOtherDevices().then(() => setMessage("Other device sessions were revoked.")).catch((error) => setMessage(error.message))}><span>Revoke other devices</span><small>Keep this phone signed in</small></button>}<button><span>Offline storage</span><small>{repository ? `${recovered ? "Recovered · " : ""}SQLite schema ${MOBILE_BUILD.localSchemaVersion}` : "Preview memory"}</small></button><button><span>Application build</span><small>{MOBILE_BUILD.channel} · {MOBILE_BUILD.build}</small></button>{authenticated && <button onClick={() => void onLogout()}><span>Sign out and lock local data</span><small>Revokes token; saved records remain locked</small></button>}<button onClick={() => void onRemove()}><span>Remove this account from device</span><small>Deletes only this account’s offline records</small></button><button onClick={() => void onWipe()}><span>Wipe all offline data</span><small>Deletes every local account and cache</small></button></div>{message && <p className="note">{message}</p>}</section>;
}

const defaultDashboard: LocalDashboard = { today: [...localPreview.today], progress: localPreview.progress[0], community: [...localPreview.community] };
const defaultWorkspace:LocalWorkspace={academic:{contextKey:null,level:"Not selected",attempt:"Not selected",subjects:[],lastUpdatedAt:null},dashboard:defaultDashboard,progress:[],planner:[],notes:[],profile:{displayName:"CA Progress student",level:null,attempt:null,timezone:null,dailyTargetMinutes:null},activity:[],leaderboard:{rank:null,score:0,category:"overall"},buddies:[],pending:0,conflicts:0,lastSyncedAt:null};

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
  const [workspace,setWorkspace]=useState<LocalWorkspace>(defaultWorkspace);
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

  useEffect(() => { if(!selected||(account.id!=="local-preview"&&!authenticated))return; let active=true;let remove:()=>void=()=>{};void openAccountRepository(account,authenticated).then(async(value)=>{if(!active||!value)return;setRepository(value);const snapshot=await value.readWorkspace();setWorkspace(snapshot);setDashboard(snapshot.dashboard);remove=value.subscribe(()=>{void value.readWorkspace().then(next=>{setWorkspace(next);setDashboard(next.dashboard);});});}).catch(()=>setRepository(null));return()=>{active=false;remove();}; }, [selected,account,authenticated]);

  useEffect(()=>{if(!authenticated||!repository)return;const coordinator=createSyncCoordinator({accountId:account.id,transport:nativeApiRequest,onState:setSyncState});const sync=()=>{void coordinator.synchronize().catch(()=>undefined);};window.addEventListener("ca-sync",sync);window.addEventListener("ca-realtime-invalidation",sync);const periodic=window.setInterval(sync,15*60*1000);sync();return()=>{coordinator.stop();window.clearInterval(periodic);window.removeEventListener("ca-sync",sync);window.removeEventListener("ca-realtime-invalidation",sync);};},[authenticated,repository,account.id]);

  if (!selected) return <Bootstrap onContinue={() => { retainLocalAccount(account); setSelected(true); }} />;
  const reset=()=>{clearLocalAccount();setRepository(null);setAuthenticated(false);setSelected(false);};
  const content = route === "settings" ? <Settings authenticated={authenticated} repository={repository} recovered={Boolean(repository?.database.recovered)} onLogout={async()=>{await repository?.lock();await logoutNative();reset();}} onRemove={async()=>{await repository?.removeFromDevice();reset();}} onWipe={async()=>{await wipeAllOfflineData();reset();}} /> : route === "today" ? <Today workspace={workspace} repository={repository}/> : route === "progress" ? <Progress workspace={workspace} repository={repository}/> : route === "syllabus"?<Syllabus workspace={workspace}/>:route === "focus" ? <Focus repository={repository}/> : route === "community" ? <Community dashboard={dashboard}/> : route==="notes"?<Notes workspace={workspace} repository={repository}/>:route==="activity"?<Activity workspace={workspace}/>:route==="buddy"?<Buddy workspace={workspace}/>:route==="profile"?<Profile workspace={workspace}/>:<Planner workspace={workspace} repository={repository}/>;
  const primary=navigation.filter(item=>["today","progress","planner","focus","community"].includes(item.route));
  return <div className="app-shell"><aside><div className="brand"><span>CA</span><div><strong>CA Progress</strong><small>Native workspace</small></div></div><nav>{navigation.map((item) => <button className={route === item.route ? "active" : ""} onClick={() => navigate(item.route)} key={item.route}><i>{item.glyph}</i>{item.label}</button>)}</nav><div className="account"><span>Z</span><div><strong>{account.displayName}</strong><small>{account.subtitle}</small></div></div></aside><main><div className="topbar"><div className="mobile-brand"><span>CA</span><strong>CA Progress</strong></div><Status online={online} state={syncState} refresh={()=>window.dispatchEvent(new Event("ca-sync"))}/></div>{content}</main><nav className="bottom-nav">{primary.map((item) => <button className={route === item.route ? "active" : ""} onClick={() => navigate(item.route)} key={item.route}><i>{item.glyph}</i><span>{item.label}</span></button>)}<button className={!primary.some(item=>item.route===route) ? "active" : ""} onClick={() => navigate("settings")}><i>◇</i><span>More</span></button></nav></div>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Mobile application root is missing.");
createRoot(root).render(<React.StrictMode><AppShell /></React.StrictMode>);
