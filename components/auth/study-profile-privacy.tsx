"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

type Visibility="private"|"buddies"|"public";
type Settings={publicBio:string;profileVisibility:Visibility;progressVisibility:Visibility;streakVisibility:Visibility;showLevel:boolean;showAttempt:boolean;buddyUserIds:string[]};
const visibilityOptions=[{value:"private",label:"Private — only me"},{value:"buddies",label:"Study buddies — accepted buddies I choose to share with"},{value:"public",label:"Public — anyone with my profile link"}] as const;

export function StudyProfilePrivacy({ownerUserId,initialSettings}:{ownerUserId:string;initialSettings:Settings}){
 const[settings,setSettings]=useState(initialSettings);const[saving,setSaving]=useState(false);const[status,setStatus]=useState<{error?:string;success?:string}|null>(null);
 async function save(){setSaving(true);setStatus(null);const response=await fetch("/api/study-profile",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({publicBio:settings.publicBio,profileVisibility:settings.profileVisibility,progressVisibility:settings.progressVisibility,streakVisibility:settings.streakVisibility,showLevel:settings.showLevel,showAttempt:settings.showAttempt})});const result=await response.json() as{ok?:boolean;error?:string;settings?:Settings};setSaving(false);if(!response.ok||!result.ok||!result.settings)return setStatus({error:result.error||"Could not save Study Profile privacy."});setSettings(result.settings);setStatus({success:"Study Profile privacy saved."});}
 return <div style={{marginTop:24}}><Card><CardHeader title="Study Profile privacy" description="Private by default. Global visibility and each accepted Study Buddy relationship are checked on the server."/><CardBody><div className="profile-form-stack">
 {status?.error?<div className="auth-status auth-status--danger" role="alert">{status.error}</div>:null}{status?.success?<div className="auth-status auth-status--success" role="status">{status.success}</div>:null}
 <label className="ui-field"><span className="ui-field__label">Public bio</span><textarea className="ui-field__control" rows={4} maxLength={240} value={settings.publicBio} onChange={(e)=>setSettings((c)=>({...c,publicBio:e.target.value}))}/><small>{settings.publicBio.length}/240 characters</small></label>
 <Select label="Profile visibility" value={settings.profileVisibility} onChange={(e)=>setSettings((c)=>({...c,profileVisibility:e.target.value as Visibility}))}>{visibilityOptions.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</Select>
 <Select label="Progress visibility" value={settings.progressVisibility} onChange={(e)=>setSettings((c)=>({...c,progressVisibility:e.target.value as Visibility}))}>{visibilityOptions.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</Select>
 <Select label="Streak & consistency visibility" value={settings.streakVisibility} onChange={(e)=>setSettings((c)=>({...c,streakVisibility:e.target.value as Visibility}))}>{visibilityOptions.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</Select>
 <label><input type="checkbox" checked={settings.showLevel} onChange={(e)=>setSettings((c)=>({...c,showLevel:e.target.checked}))}/> Show my CA level when my Study Profile is visible</label><label><input type="checkbox" checked={settings.showAttempt} onChange={(e)=>setSettings((c)=>({...c,showAttempt:e.target.checked}))}/> Show my target attempt when my Study Profile is visible</label>
 <Button size="lg" isLoading={saving} onClick={save}>Save Study Profile privacy</Button><small>Direct profile path: /study-profile/{ownerUserId}. Public visibility never exposes test scores, answer sheets, notes, or private reflections.</small>
 </div></CardBody></Card><Card style={{marginTop:16}}><CardHeader title="Study Buddy accountability" description="New buddy access is request-based. Acceptance does not share anything automatically; each relationship starts with all granular sharing off."/><CardBody><div className="profile-form-stack"><p>Manage requests, per-buddy privacy, nudges, shared weekly goals, Study Together sessions, mute, block and report from the Study Buddy dashboard.</p><Link className="ui-button ui-button--secondary ui-button--md" href="/study-buddy"><span>Open Study Buddy</span></Link>{settings.buddyUserIds.length?<small>{settings.buddyUserIds.length} legacy/accepted buddy profile ACL entr{settings.buddyUserIds.length===1?"y":"ies"} currently exists; new grants require acceptance.</small>:null}</div></CardBody></Card></div>;
}
