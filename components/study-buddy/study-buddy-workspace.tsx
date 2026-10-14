"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {StudyBuddyComparison,studyTime} from "./study-buddy-comparison";
import type {StudyBuddyComparisonItem,StudyBuddyOwnerSummary} from "@/lib/study-buddy/comparison";

type Sharing = {
  shareProfile: boolean;
  shareProgress: boolean;
  shareStreak: boolean;
  shareGoals: boolean;
  shareStudyStatus: boolean;
};
type RequestItem = { relationshipId: string; userId: string; displayName: string; requestedAt: string };
type Goal = {
  id: string;
  title: string;
  week_start: string;
  target_minutes_per_person: number;
  status: string;
  contributions: Record<string, number>;
};
type Together = {
  id: string;
  status: string;
  started_at: string;
  participants: { user_id: string; joined_at: string | null; canonical_study_session_id: string | null; completed_at: string | null }[];
};
type Buddy = {
  relationshipId: string;
  userId: string;
  displayName: string;
  mySharing: Sharing;
  buddySharing: Sharing;
  muted: boolean;
  accountability: { publicBio?: string; caLevel?: string; attemptKey?: string; weekStudyMinutes?: number; currentStreakDays?: number };
  goals: Goal[];
  studyTogether: Together | null;
};
export type StudyBuddyDashboard = {
  incomingRequests: RequestItem[];
  outgoingRequests: RequestItem[];
  buddies: Buddy[];
  recentNudges: { id: string; sender_user_id: string; sender_display_name: string | null; message: string; created_at: string }[];
  nudgeLimitPer24Hours: number;
};

function currentWeekStart() {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const date=new Date(`${today}T12:00:00Z`);
  const day=date.getUTCDay();
  date.setUTCDate(date.getUTCDate()+(day===0?-6:1-day));
  return date.toISOString().slice(0,10);
}
function timestamp(value:string) {
  const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:`${value.replace(' ','T')}Z`;
  const date=new Date(normalized);
  return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(date);
}

export function StudyBuddyWorkspace({ ownerUserId, initialDashboard, initialComparison=[], initialOwnerSummary, preview=false }: { ownerUserId: string; initialDashboard: StudyBuddyDashboard;initialComparison?:StudyBuddyComparisonItem[];initialOwnerSummary?:StudyBuddyOwnerSummary;preview?:boolean }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [buddyId, setBuddyId] = useState("");
  const [comparison,setComparison]=useState(initialComparison);
  const [ownerSummary,setOwnerSummary]=useState(initialOwnerSummary);
  const [selectedId,setSelectedId]=useState(initialDashboard.buddies[0]?.userId||'');
  const [search,setSearch]=useState('');
  const [tab,setTab]=useState<'buddies'|'incoming'|'sent'>('buddies');
  const [sharingOpen,setSharingOpen]=useState(false);
  const pending=useRef(false);
  const buddy=dashboard.buddies.find(item=>item.userId===selectedId)||dashboard.buddies[0];
  const filtered=dashboard.buddies.filter(item=>item.displayName.toLowerCase().includes(search.trim().toLowerCase()));
  const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()||'S';
  const subtitle=(item:Buddy)=>{
    const attempt=item.accountability.attemptKey;
    const label=attempt&&/^\d{4}-(01|05|09)$/.test(attempt)?new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${attempt}-01T00:00:00Z`)):attempt;
    return [item.accountability.caLevel,label].filter(Boolean).join(' · ')||'Study buddy';
  };

  async function refresh() {
    const response = await fetch("/api/v1/study-buddy", { cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; dashboard?: StudyBuddyDashboard;comparison?:StudyBuddyComparisonItem[];ownerSummary?:StudyBuddyOwnerSummary; error?: string };
    if (!response.ok || !payload.dashboard) throw new Error(payload.error || "Study Buddy could not be refreshed.");
    setDashboard(payload.dashboard);
    setComparison(payload.comparison||[]);
    setOwnerSummary(payload.ownerSummary);
  }

  async function mutate(payload: Record<string, unknown>, success: string) {
    if(preview){setNotice('Preview only. No changes were made.');return false;}
    if(pending.current)return false;
    pending.current=true;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/study-buddy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Study Buddy could not be updated.");
      try {await refresh();} catch {
        // Hide the previous snapshot if permissions changed but refresh failed.
        setDashboard({buddies:[],incomingRequests:[],outgoingRequests:[],recentNudges:[],nudgeLimitPer24Hours:dashboard.nudgeLimitPer24Hours});
        setComparison([]);
        setError('Updated, but could not reload. Refresh the page to continue.');
        return false;
      }
      setNotice(success);
      return true;
    } catch (err) {
      setError(err instanceof Error && !(err instanceof TypeError) && !(err instanceof SyntaxError) ? err.message : "Could not connect. Try again.");
      return false;
    } finally {
      pending.current=false;
      setBusy(false);
    }
  }

  function requestBuddy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!buddyId.trim()) return;
    const requestedId = buddyId.trim();
    void mutate({ action: "request", buddyUserId: requestedId }, "Study Buddy request sent.").then(ok=>{if(ok)setBuddyId('');});
  }

  function toggleSharing(buddy: Buddy, key: keyof Sharing) {
    void mutate({ action: "sharing", buddyUserId: buddy.userId, ...buddy.mySharing, [key]: !buddy.mySharing[key] }, "Relationship privacy updated.");
  }

  function createGoal(event: FormEvent<HTMLFormElement>, buddy: Buddy) {
    event.preventDefault();
    const element=event.currentTarget;
    const form = new FormData(element);
    void mutate({
      action: "createGoal",
      buddyUserId: buddy.userId,
      title: form.get("title"),
      weekStart: form.get("weekStart"),
      targetMinutesPerPerson: Number(form.get("targetMinutesPerPerson")),
    }, "Shared weekly goal created.").then(ok=>{if(ok)element.reset();});
  }

  function contributeGoal(event: FormEvent<HTMLFormElement>, goal: Goal) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({ action: "contributeGoal", goalId: goal.id, studySessionId: form.get("studySessionId") }, "Your canonical study session was added to this goal.");
  }

  function completeTogether(event: FormEvent<HTMLFormElement>, together: Together) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({ action: "completeTogether", studyTogetherId: together.id, studySessionId: form.get("studySessionId") }, "Study Together completion linked without duplicate credit.");
  }

  function requestList(requests:RequestItem[],incoming:boolean) {
    return <div className="buddy-requests">{requests.length?requests.map(request=><article key={request.relationshipId}>
      <span className="buddy-avatar">{initials(request.displayName)}</span>
      <div className="buddy-request-copy"><strong>{request.displayName}</strong><small>{incoming?'Wants to study with you':'Request pending'}</small></div>
      {incoming?<div className="buddy-request-actions"><Button disabled={busy} onClick={()=>void mutate({action:'respond',buddyUserId:request.userId,response:'accept'},'Study Buddy request accepted.')}>Accept</Button><Button variant="secondary" disabled={busy} onClick={()=>void mutate({action:'respond',buddyUserId:request.userId,response:'reject'},'Request declined.')}>Decline</Button></div>:<span className="buddy-pending">Pending</span>}
    </article>):<p className="buddy-muted">{incoming?'No incoming requests.':'No sent requests.'}</p>}</div>;
  }

  return <main className="study-buddy-page buddy-refined">
    {preview?<div className="buddy-preview-notice">Design preview · sample data. <a href="/study-buddy">Back to your buddies</a></div>:null}
    <header className="buddy-page-heading"><h1>Study Buddy</h1><Button variant="secondary" disabled={!buddy||tab!=='buddies'} aria-expanded={sharingOpen} onClick={()=>setSharingOpen(value=>!value)}><Icon name="settings" size={17}/>Sharing settings</Button></header>
    <nav className="buddy-tabs" aria-label="Study buddy views">{([
      ['buddies','My buddies',dashboard.buddies.length],['incoming','Requests',dashboard.incomingRequests.length],['sent','Sent requests',dashboard.outgoingRequests.length],
    ] as const).map(([key,label,count])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>{setTab(key);setSharingOpen(false);}}>{label}<span>{count}</span></button>)}</nav>
    {error?<div className="study-buddy-alert study-buddy-alert--error" role="alert">{error}</div>:null}
    {notice?<div className="study-buddy-alert study-buddy-alert--success" role="status">{notice}</div>:null}
    <div className="buddy-layout">
      <aside className="buddy-sidebar buddy-surface" aria-label="Buddy list and requests">
        {tab==='buddies'?<>
          <h2>My buddies</h2>
          <label className="buddy-search"><Icon name="search" size={18}/><input aria-label="Search your buddies" placeholder="Search your buddies…" value={search} onChange={event=>setSearch(event.target.value)}/></label>
          <div className="buddy-list">{filtered.length?filtered.map(item=><button key={item.relationshipId} type="button" className="buddy-list-row" aria-pressed={buddy?.userId===item.userId} onClick={()=>{setSelectedId(item.userId);setSharingOpen(false);}}>
            <span className="buddy-avatar">{initials(item.displayName)}</span><span><strong>{item.displayName}</strong><small>{subtitle(item)}</small></span><Icon name="chevron" size={17}/>
          </button>):<p className="buddy-muted">{search?'No buddies match your search.':'Your study buddies will appear here.'}</p>}</div>
        </>:<><h2>{tab==='incoming'?'Requests':'Sent requests'}</h2>{requestList(tab==='incoming'?dashboard.incomingRequests:dashboard.outgoingRequests,tab==='incoming')}</>}
        <section className="buddy-connect"><h2>Add study buddy</h2><form onSubmit={requestBuddy}>
          <input aria-label="Study buddy user ID" value={buddyId} onChange={event=>setBuddyId(event.target.value)} placeholder="Enter exact buddy ID" required maxLength={128}/>
          <Button type="submit" disabled={busy||!buddyId.trim()}>Send request</Button>
        </form><details className="buddy-own-id"><summary>Your buddy ID</summary><code>{ownerUserId}</code></details></section>
        {tab==='buddies'&&dashboard.incomingRequests.length?<section className="buddy-incoming"><h2>Incoming requests</h2>{requestList(dashboard.incomingRequests.slice(0,2),true)}{dashboard.incomingRequests.length>2?<button type="button" className="buddy-text-action" onClick={()=>setTab('incoming')}>View all requests</button>:null}</section>:null}
      </aside>
      <section className="buddy-main buddy-surface" aria-label="Selected buddy workspace">
        {buddy&&tab==='buddies'?<>
          <header className="buddy-detail-heading"><span className="buddy-avatar buddy-avatar--large">{initials(buddy.displayName)}</span><div><div className="buddy-name-line"><h2>{buddy.displayName}</h2><span className="buddy-connected">Connected</span></div><p>{subtitle(buddy)}</p><a href={`/study-profile/${encodeURIComponent(buddy.userId)}`} onClick={preview?event=>{event.preventDefault();setNotice('Preview only. This is a sample profile.');}:undefined}>View profile <Icon name="arrow" size={15}/></a></div><details className="buddy-menu"><summary aria-label="Buddy options"><Icon name="more"/></summary><div><Button variant="ghost" disabled={busy} onClick={()=>void mutate({action:'safety',buddyUserId:buddy.userId,mode:buddy.muted?'unmute':'mute'},buddy.muted?'Buddy unmuted.':'Buddy muted.')}>{buddy.muted?'Unmute':'Mute'}</Button><Button variant="ghost" disabled={busy} onClick={()=>void mutate({action:'remove',buddyUserId:buddy.userId},'Study Buddy removed.')}>Remove buddy</Button><Button variant="ghost" disabled={busy} onClick={()=>void mutate({action:'safety',buddyUserId:buddy.userId,mode:'block'},'Account blocked and relationship ended.')}>Block</Button></div></details></header>
          {sharingOpen?<section className="buddy-sharing buddy-surface" aria-label="Sharing settings"><h3>What I share with this buddy</h3><div>{([
            ['shareProfile','Profile details'],['shareProgress','Study progress'],['shareStreak','Study streak'],['shareGoals','Shared weekly goals'],['shareStudyStatus','Study Together status'],
          ] as [keyof Sharing,string][]).map(([key,label])=><label key={key}><input type="checkbox" checked={buddy.mySharing[key]} disabled={busy} onChange={()=>toggleSharing(buddy,key)}/>{label}</label>)}</div></section>:null}
          <section className="buddy-hero"><div><h2>Keep each other going</h2><p>Study sessions, shared on your terms.</p><div className="buddy-hero-actions"><Button variant="secondary" disabled={busy} onClick={()=>void mutate({action:'nudge',buddyUserId:buddy.userId},'Nudge sent.')}>Nudge</Button><a className="ui-button ui-button--md" href="#buddy-together">Study Together</a></div></div><Icon name="book" size={115} className="buddy-hero-art"/></section>
          <StudyBuddyComparison item={comparison.find(item=>item.userId===buddy.userId)} owner={ownerSummary} name={buddy.displayName}/>
          <div className="buddy-card-grid">
            <section className="buddy-surface buddy-goals"><h3>Shared weekly goals</h3>
              {buddy.mySharing.shareGoals&&buddy.buddySharing.shareGoals?<>
                {buddy.goals.length?buddy.goals.map(goal=><article key={goal.id}><strong>{goal.title}</strong><small>Week of {goal.week_start}</small>{[[ownerUserId,'You'],[buddy.userId,buddy.displayName]].map(([id,label])=><div className="buddy-goal-progress" key={id}><span>{label}</span><progress aria-label={`${label}: ${goal.title}`} max={goal.target_minutes_per_person} value={Math.min(goal.target_minutes_per_person,goal.contributions[id]??0)}/><small>{studyTime(goal.contributions[id]??0)} / {studyTime(goal.target_minutes_per_person)}</small></div>)}<details><summary>Add a completed session</summary><form className="buddy-compact-form" onSubmit={event=>contributeGoal(event,goal)}><label>Study session ID<input name="studySessionId" required/></label><Button type="submit" disabled={busy}>Add session</Button></form></details></article>):<p className="buddy-muted">Set a goal to build consistency together.</p>}
                <details><summary>Set goal</summary><form className="buddy-compact-form" onSubmit={event=>createGoal(event,buddy)}><label>Goal<input name="title" placeholder="Audit revision" required maxLength={120}/></label><label>Week starting<input name="weekStart" type="date" defaultValue={currentWeekStart()} required/></label><label>Minutes each<input name="targetMinutesPerPerson" type="number" min={1} max={10080} defaultValue={300} required/></label><Button type="submit" disabled={busy}>Create shared goal</Button></form></details>
              </>:<p className="buddy-muted"><Icon name="lock" size={15}/> Both buddies need to enable shared goals in Sharing settings.</p>}
            </section>
            <section className="buddy-surface buddy-recent"><h3><Icon name="bell" size={18}/>Recent nudges</h3>{dashboard.recentNudges.filter(nudge=>nudge.sender_user_id===buddy.userId).slice(0,3).map(nudge=><article key={nudge.id}><strong>{nudge.sender_display_name||buddy.displayName}</strong><time dateTime={nudge.created_at}>{timestamp(nudge.created_at)}</time><p>{nudge.message}</p></article>)}{!dashboard.recentNudges.some(nudge=>nudge.sender_user_id===buddy.userId)?<p className="buddy-muted">No nudges from this buddy yet.</p>:null}<small>Up to {dashboard.nudgeLimitPer24Hours} nudges per buddy each day.</small></section>
          </div>
          <section className="buddy-surface buddy-together" id="buddy-together"><h3>Study Together</h3><p className="buddy-muted">A shared study session with no audio/video.</p>
            {buddy.mySharing.shareStudyStatus&&buddy.buddySharing.shareStudyStatus?buddy.studyTogether?<div className="buddy-together-session"><strong>Session started {timestamp(buddy.studyTogether.started_at)}</strong>{buddy.studyTogether.participants.find(item=>item.user_id===ownerUserId)?.joined_at?null:<Button disabled={busy} onClick={()=>void mutate({action:'joinTogether',studyTogetherId:buddy.studyTogether?.id},'Joined Study Together.')}>Join session</Button>}<form className="buddy-compact-form" onSubmit={event=>completeTogether(event,buddy.studyTogether as Together)}><label>Completed study session ID<input name="studySessionId" required/></label><Button type="submit" disabled={busy}>Link completion</Button></form></div>:<Button disabled={busy} onClick={()=>void mutate({action:'startTogether',buddyUserId:buddy.userId},'Study Together started.')}>Start Study Together</Button>:<p className="buddy-muted"><Icon name="lock" size={15}/> Both buddies need to enable Study Together status in Sharing settings.</p>}
          </section>
          <p className="buddy-privacy-note"><Icon name="lock" size={15}/>Only information you choose to share is visible.</p>
          <details className="buddy-report"><summary>Report safety issue</summary><form className="buddy-compact-form" onSubmit={event=>{event.preventDefault();const element=event.currentTarget;const form=new FormData(element);void mutate({action:'report',buddyUserId:buddy.userId,reason:form.get('reason'),details:form.get('details')},'Report submitted for review.').then(ok=>{if(ok)element.reset();});}}><label>Reason<input name="reason" required maxLength={80}/></label><label>Details<textarea name="details" maxLength={600}/></label><Button type="submit" variant="secondary" disabled={busy}>Report</Button></form></details>
        </>:<div className="buddy-welcome"><span><Icon name="community" size={44}/></span><h2>{tab==='buddies'?'Find your study buddy':'Study on your terms'}</h2><p>{tab==='buddies'?'Send a request to someone you know and keep each other going.':'Accept a request to connect. You choose what to share.'}</p><small>No public people-search or follower feed.</small></div>}
      </section>
    </div>
  </main>;
}
