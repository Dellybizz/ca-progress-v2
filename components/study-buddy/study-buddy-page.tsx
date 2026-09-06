"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Sharing={shareProfile:boolean;shareProgress:boolean;shareStreak:boolean;shareLevel:boolean;shareAttempt:boolean;shareWeeklyGoal:boolean;shareStudyTogether:boolean};
type RequestItem={relationshipId:string;userId:string;createdAt:string};
type Buddy={relationshipId:string;buddyUserId:string;mySharing:Sharing;theirSharing:Sharing;profile:Record<string,unknown>|null};
type Goal={id:string;relationship_id:string;week_start:string;title:string;target_minutes:number;status:string;summary:{byUser:Record<string,number>;totalMinutes:number;remainingMinutes:number;percent:number}};
type Session={id:string;relationship_id:string;inviter_user_id:string;invitee_user_id:string;goal_id:string|null;planned_minutes:number;status:string;scheduled_for?:string|null};
type Nudge={id:string;relationship_id:string;sender_user_id:string;kind:string;status:string;created_at:string};
type Dashboard={requests:{incoming:RequestItem[];outgoing:RequestItem[]};buddies:Buddy[];goals:Goal[];studyTogether:Session[];nudges:Nudge[];mutes:Array<{userId:string;muteNudges:boolean;muteInvitations:boolean}>;blockedUserIds:string[]};

type MutationResponse={ok?:boolean;error?:string;dashboard?:Dashboard};

const shareLabels:Array<[keyof Sharing,string]>=[
  ["shareProfile","Profile"],["shareProgress","Progress"],["shareStreak","Streak"],["shareLevel","CA level"],["shareAttempt","Target attempt"],["shareWeeklyGoal","Shared weekly goal"],["shareStudyTogether","Study Together"],
];

export function StudyBuddyPage({userId,initialDashboard}:{userId:string;initialDashboard:Dashboard}){
  const [dashboard,setDashboard]=useState(initialDashboard);
  const [target,setTarget]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [sharingDrafts,setSharingDrafts]=useState<Record<string,Sharing>>(()=>Object.fromEntries(initialDashboard.buddies.map((b)=>[b.relationshipId,b.mySharing])));
  const [goalDraft,setGoalDraft]=useState<Record<string,{title:string;targetMinutes:string;weekStart:string}>>({});
  const [sessionMinutes,setSessionMinutes]=useState<Record<string,string>>({});

  async function act(body:Record<string,unknown>,success:string){
    setBusy(true);setError(null);setMessage(null);
    const response=await fetch("/api/study-buddy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json() as MutationResponse;
    setBusy(false);
    if(!response.ok||!result.ok||!result.dashboard){setError(result.error||"Study Buddy action failed.");return;}
    setDashboard(result.dashboard);
    setSharingDrafts((current)=>({...current,...Object.fromEntries(result.dashboard!.buddies.map((b)=>[b.relationshipId,current[b.relationshipId]??b.mySharing]))}));
    setMessage(success);
  }

  function draftFor(buddy:Buddy){return sharingDrafts[buddy.relationshipId]??buddy.mySharing;}
  const today=new Date().toISOString().slice(0,10);

  return <div className="profile-form-stack">
    <div>
      <h1>Study Buddy</h1>
      <p>Opt-in accountability only. Nothing in the Study Buddy relationship is shared before the other student accepts, and every accepted relationship starts with all sharing switched off.</p>
    </div>
    {error?<div className="auth-status auth-status--danger" role="alert">{error}</div>:null}
    {message?<div className="auth-status auth-status--success" role="status">{message}</div>:null}

    <Card><CardHeader title="Add a Study Buddy" description="Send a request using an exact CA Progress user ID. There is no public discovery or people search."/><CardBody>
      <div className="profile-form-stack"><Input label="Study Buddy user ID" value={target} maxLength={128} onChange={(e)=>setTarget(e.target.value)} placeholder="Exact user ID"/><Button disabled={busy||!target.trim()} onClick={()=>act({action:"request",targetUserId:target.trim()},"Study Buddy request sent.").then(()=>setTarget(""))}>Send request</Button></div>
    </CardBody></Card>

    {(dashboard.requests.incoming.length||dashboard.requests.outgoing.length)?<Card><CardHeader title="Requests" description="Academic and accountability data stays private until acceptance."/><CardBody><div className="profile-form-stack">
      {dashboard.requests.incoming.map((item)=><div key={item.relationshipId}><strong>{item.userId}</strong> wants to be your Study Buddy. <Button size="sm" disabled={busy} onClick={()=>act({action:"respond-request",relationshipId:item.relationshipId,decision:"accept"},"Study Buddy accepted.")}>Accept</Button> <Button size="sm" variant="ghost" disabled={busy} onClick={()=>act({action:"respond-request",relationshipId:item.relationshipId,decision:"reject"},"Request rejected.")}>Reject</Button></div>)}
      {dashboard.requests.outgoing.map((item)=><div key={item.relationshipId}><strong>{item.userId}</strong> — request pending.</div>)}
    </div></CardBody></Card>:null}

    {dashboard.buddies.length?<div className="profile-form-stack">{dashboard.buddies.map((buddy)=>{
      const draft=draftFor(buddy); const myGoal=dashboard.goals.find((goal)=>goal.relationship_id===buddy.relationshipId&&goal.status==="active"); const sessions=dashboard.studyTogether.filter((s)=>s.relationship_id===buddy.relationshipId);
      const mute=dashboard.mutes.find((m)=>m.userId===buddy.buddyUserId);
      const gd=goalDraft[buddy.relationshipId]??{title:"",targetMinutes:"300",weekStart:today};
      return <Card key={buddy.relationshipId}><CardHeader title={`Buddy: ${buddy.buddyUserId}`} description="Sharing below applies only to this accepted relationship."/><CardBody><div className="profile-form-stack">
        <div><strong>Granular sharing</strong><div className="profile-form-stack">{shareLabels.map(([key,label])=><label key={key}><input type="checkbox" checked={draft[key]} onChange={(e)=>setSharingDrafts((current)=>({...current,[buddy.relationshipId]:{...draft,[key]:e.target.checked}}))}/> Share {label}</label>)}</div><Button size="sm" disabled={busy} onClick={()=>act({action:"sharing",relationshipId:buddy.relationshipId,...draft},"Buddy privacy updated.")}>Save sharing</Button></div>

        <div><strong>Nudges</strong><p><small>Fixed, non-text nudges are limited to 3 per 24 hours with a 30-minute cooldown.</small></p><Button size="sm" disabled={busy} onClick={()=>act({action:"nudge",relationshipId:buddy.relationshipId,kind:"start_studying"},"Nudge sent.")}>Start studying</Button> <Button size="sm" variant="secondary" disabled={busy} onClick={()=>act({action:"nudge",relationshipId:buddy.relationshipId,kind:"keep_going"},"Nudge sent.")}>Keep going</Button></div>

        <div><strong>Shared weekly goal</strong>{myGoal?<div><p>{myGoal.title}: {myGoal.summary.totalMinutes}/{myGoal.target_minutes} min ({myGoal.summary.percent}%)</p><Input type="number" label="Add my minutes" value={sessionMinutes[`goal:${myGoal.id}`]??"30"} min={1} max={1440} onChange={(e)=>setSessionMinutes((c)=>({...c,[`goal:${myGoal.id}`]:e.target.value}))}/><Button size="sm" disabled={busy} onClick={()=>act({action:"goal-contribution",goalId:myGoal.id,minutes:Number(sessionMinutes[`goal:${myGoal.id}`]??30)},"Contribution recorded.")}>Add contribution</Button></div>:<div><Input label="Goal title" value={gd.title} maxLength={80} onChange={(e)=>setGoalDraft((c)=>({...c,[buddy.relationshipId]:{...gd,title:e.target.value}}))}/><Input type="date" label="Week start" value={gd.weekStart} onChange={(e)=>setGoalDraft((c)=>({...c,[buddy.relationshipId]:{...gd,weekStart:e.target.value}}))}/><Input type="number" label="Target minutes" value={gd.targetMinutes} min={1} max={10080} onChange={(e)=>setGoalDraft((c)=>({...c,[buddy.relationshipId]:{...gd,targetMinutes:e.target.value}}))}/><Button size="sm" disabled={busy||!gd.title.trim()} onClick={()=>act({action:"weekly-goal",relationshipId:buddy.relationshipId,title:gd.title,weekStart:gd.weekStart,targetMinutes:Number(gd.targetMinutes)},"Shared weekly goal created.")}>Create goal</Button></div>}</div>

        <div><strong>Study Together</strong><Input type="number" label="Planned minutes" value={sessionMinutes[buddy.relationshipId]??"45"} min={5} max={480} onChange={(e)=>setSessionMinutes((c)=>({...c,[buddy.relationshipId]:e.target.value}))}/><Button size="sm" disabled={busy} onClick={()=>act({action:"study-together-invite",relationshipId:buddy.relationshipId,plannedMinutes:Number(sessionMinutes[buddy.relationshipId]??45),goalId:myGoal?.id??null},"Study Together invitation sent.")}>Invite</Button>
          {sessions.map((s)=><div key={s.id}><small>{s.planned_minutes} min · {s.status}</small>{s.status==="invited"&&s.invitee_user_id===userId?<><Button size="sm" onClick={()=>act({action:"study-together-respond",sessionId:s.id,decision:"accept"},"Session accepted.")}>Accept</Button><Button size="sm" variant="ghost" onClick={()=>act({action:"study-together-respond",sessionId:s.id,decision:"decline"},"Session declined.")}>Decline</Button></>:null}{s.status==="accepted"?<Button size="sm" variant="secondary" onClick={()=>act({action:"study-together-complete",sessionId:s.id,minutes:s.planned_minutes},"Your completion was recorded; shared credit waits for both students.")}>Complete my part</Button>:null}{["invited","accepted"].includes(s.status)?<Button size="sm" variant="ghost" onClick={()=>act({action:"study-together-cancel",sessionId:s.id},"Session cancelled.")}>Cancel</Button>:null}</div>)}
        </div>

        <div><strong>Safety</strong><label><input type="checkbox" checked={mute?.muteNudges??false} onChange={(e)=>act({action:"mute",targetUserId:buddy.buddyUserId,muteNudges:e.target.checked,muteInvitations:mute?.muteInvitations??false},"Mute settings updated.")}/> Mute nudges</label> <label><input type="checkbox" checked={mute?.muteInvitations??false} onChange={(e)=>act({action:"mute",targetUserId:buddy.buddyUserId,muteNudges:mute?.muteNudges??false,muteInvitations:e.target.checked},"Mute settings updated.")}/> Mute invitations</label><div><Button size="sm" variant="ghost" disabled={busy} onClick={()=>act({action:"report",targetUserId:buddy.buddyUserId,category:"spam"},"Report submitted privately.")}>Report</Button> <Button size="sm" variant="danger" disabled={busy} onClick={()=>act({action:"block",targetUserId:buddy.buddyUserId},"Buddy blocked and relationship access revoked.")}>Block</Button> <Button size="sm" variant="ghost" disabled={busy} onClick={()=>act({action:"remove",relationshipId:buddy.relationshipId},"Study Buddy removed.")}>Remove buddy</Button></div></div>
      </div></CardBody></Card>;
    })}</div>:<Card><CardBody><p>No accepted Study Buddies yet.</p></CardBody></Card>}

    {dashboard.nudges.length?<Card><CardHeader title="Recent nudges"/><CardBody><div className="profile-form-stack">{dashboard.nudges.map((n)=><div key={n.id}><strong>{n.sender_user_id}</strong>: {n.kind.replaceAll("_"," ")} <Button size="sm" variant="ghost" disabled={busy} onClick={()=>act({action:"nudge-status",nudgeId:n.id,status:"dismissed"},"Nudge dismissed.")}>Dismiss</Button></div>)}</div></CardBody></Card>:null}
  </div>;
}
