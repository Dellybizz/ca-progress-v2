"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import type { ChapterHubItem, ChapterHubLink, ChapterHubReadyModel } from "@/lib/chapter-hub/types";
import type { ProgressState } from "@/lib/progress/types";
import { AcademicEntityMark } from "@/components/academic/academic-navigation";

const PROGRESS_SYNC_EVENT = "ca-progress:chapter-sync";
function readSyncedProgress(chapterId:string):ProgressState|null{
  if(typeof window==="undefined")return null;
  try{const value=sessionStorage.getItem(`ca-progress:chapter:${chapterId}`);return value?JSON.parse(value) as ProgressState:null;}catch{return null;}
}
function writeSyncedProgress(chapterId:string,state:ProgressState){
  try{sessionStorage.setItem(`ca-progress:chapter:${chapterId}`,JSON.stringify(state));window.dispatchEvent(new CustomEvent(PROGRESS_SYNC_EVENT,{detail:{chapterId,state}}));}catch{}
}

const STAGES: Array<{ field: keyof ProgressState; label: string; short: string }> = [
  { field: "completed_at", label: "Completed", short: "Done" }, { field: "revision_1_at", label: "Revision 1", short: "Rev. 1" },
  { field: "revision_2_at", label: "Revision 2", short: "Rev. 2" }, { field: "test_1_at", label: "Test 1", short: "Test 1" }, { field: "test_2_at", label: "Test 2", short: "Test 2" },
];
function dateLabel(value: string | null) { if (!value) return "Not yet"; return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function durationLabel(seconds: number) { const minutes = Math.round(seconds / 60); if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; return rest ? `${hours}h ${rest}m` : `${hours}h`; }
function resourceCode(item: ChapterHubItem) {
  const prefix = item.sourceKind.startsWith("personal_") ? "PVT" : item.sourceKind.startsWith("community_") ? "COM" : "ICAI";
  let hash = 2166136261;
  for (const character of `${item.sourceKind}:${item.sourceId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${prefix}-${(hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}
function SectionTitle({ icon, eyebrow, title, action }: { icon: IconName; eyebrow: string; title: string; action?: React.ReactNode }) { return <header className="chapter-hub-section__header"><div className="chapter-hub-section__title"><span><Icon name={icon} size={18}/></span><div><small>{eyebrow}</small><h2>{title}</h2></div></div>{action}</header>; }

export function ChapterHub({ model }: { model: ChapterHubReadyModel }) {
  const [mobileView, setMobileView] = useState<"overview" | "study" | "resources">("overview");
  const [progress, setProgress] = useState(model.progress);
  const [dateDrafts, setDateDrafts] = useState<Record<keyof ProgressState,string>>(Object.fromEntries(STAGES.map((stage)=>[stage.field,model.progress[stage.field]?.slice(0,10)??""])) as Record<keyof ProgressState,string>);
  const [understandingLevel, setUnderstandingLevel] = useState(model.understandingLevel ?? 0);
  const [savedUnderstandingLevel, setSavedUnderstandingLevel] = useState(model.understandingLevel ?? 0);
  const [links, setLinks] = useState(model.links);
  const [pinnedItems, setPinnedItems] = useState(model.pinnedItems);
  const [availableItems, setAvailableItems] = useState(model.availableItems);
  const [linkDraft, setLinkDraft] = useState({ kind: "useful" as ChapterHubLink["kind"], title: "", url: "" });
  const [resourceTab, setResourceTab] = useState<"private" | "community" | "icai">("private");
  const [resourceQuery, setResourceQuery] = useState("");
  const [message, setMessage] = useState("");
  const { academic } = model;
  useEffect(()=>{
    const apply=()=>{const state=readSyncedProgress(academic.chapterId);if(!state)return;setProgress(state);setDateDrafts(Object.fromEntries(STAGES.map((stage)=>[stage.field,state[stage.field]?.slice(0,10)??""])) as Record<keyof ProgressState,string>);};
    apply();window.addEventListener(PROGRESS_SYNC_EVENT,apply);return()=>window.removeEventListener(PROGRESS_SYNC_EVENT,apply);
  },[academic.chapterId]);
  const progressCount = STAGES.filter((stage) => Boolean(progress[stage.field])).length;
  const controlsDirty = understandingLevel !== savedUnderstandingLevel || STAGES.some((stage) => Boolean(progress[stage.field]) && dateDrafts[stage.field] !== progress[stage.field]?.slice(0,10));
  const chapterQuery = `chapterId=${encodeURIComponent(academic.chapterId)}&subjectId=${encodeURIComponent(academic.subjectId)}`;
  const lastStudyAt = model.study.recentSessions[0]?.endedAt ?? null;
  const understanding = model.study.averageSelfReportedUnderstanding;
  const nextStage = STAGES.find((stage) => !progress[stage.field]);
  const filteredAvailableItems = useMemo(() => {
    const query = resourceQuery.trim().toLocaleLowerCase();
    return availableItems.filter((item) => {
      const source = item.sourceKind.startsWith("personal_") ? "private" : item.sourceKind.startsWith("community_") ? "community" : "icai";
      return source === resourceTab && (!query || `${resourceCode(item)} ${item.title} ${item.meta}`.toLocaleLowerCase().includes(query));
    });
  }, [availableItems, resourceQuery, resourceTab]);
  const resourceCounts = useMemo(() => ({
    private: availableItems.filter((item) => item.sourceKind.startsWith("personal_")).length,
    community: availableItems.filter((item) => item.sourceKind.startsWith("community_")).length,
    icai: availableItems.filter((item) => item.sourceKind === "icai_resource").length,
  }), [availableItems]);
  const activity = [
    ...model.progressEvents.map((event) => ({ id: `progress-${event.id}`, at: event.createdAt, icon: "target" as IconName, title: `${event.stage.replaceAll("_", " ")} ${event.action}` })),
    ...model.study.recentSessions.map((session) => ({ id: `study-${session.id}`, at: session.endedAt, icon: "timer" as IconName, title: `${durationLabel(session.durationSeconds)} Focus session` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
  async function mutate(body:Record<string,unknown>){
    const response=await fetch(`/api/chapters/${encodeURIComponent(academic.chapterId)}/workspace`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const payload=await response.json() as {error?:string;[key:string]:unknown};
    if(!response.ok)throw new Error(payload.error||"Chapter could not be updated.");
    return payload;
  }
  async function saveChapterControls(){
    if(!controlsDirty)return;
    setMessage("Saving…");
    try{
      const updates:Promise<Record<string,unknown>>[]=[];
      for(const stage of STAGES){
        if(!progress[stage.field])continue;
        const saved=progress[stage.field]?.slice(0,10)??"";
        if(dateDrafts[stage.field]!==saved)updates.push(mutate({action:"set_stage_date",stage:stage.field.replace(/_at$/,""),date:dateDrafts[stage.field]}));
      }
      if(understandingLevel!==savedUnderstandingLevel)updates.push(mutate({action:"set_understanding",level:understandingLevel}));
      await Promise.all(updates);
      const nextProgress=Object.fromEntries(STAGES.map((stage)=>[stage.field,progress[stage.field]? `${dateDrafts[stage.field]}T12:00:00.000Z`:null])) as ProgressState;
      writeSyncedProgress(academic.chapterId,nextProgress);setProgress(nextProgress);
      setSavedUnderstandingLevel(understandingLevel);
      setMessage("Saved");
    }catch(error){setMessage(error instanceof Error?error.message:"Chapter controls could not be saved.");}
  }
  async function addLink(event:React.FormEvent){
    event.preventDefault(); setMessage("");
    try{
      const payload=await mutate({action:"add_link",...linkDraft});
      setLinks((items)=>[payload.link as ChapterHubLink,...items]); setLinkDraft({...linkDraft,title:"",url:""}); setMessage("Link added");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not add link.");}
  }
  async function attachItem(item:ChapterHubItem){
    setAvailableItems((items)=>items.filter((candidate)=>candidate!==item)); setPinnedItems((items)=>[{...item,id:`pending-${item.sourceId}`},...items]); setMessage("Saving…");
    try{const payload=await mutate({action:"attach_item",sourceKind:item.sourceKind,sourceId:item.sourceId});setPinnedItems((items)=>items.map((candidate)=>candidate.sourceKind===item.sourceKind&&candidate.sourceId===item.sourceId?{...candidate,id:String(payload.id)}:candidate));setMessage("Attached");}
    catch(error){setPinnedItems((items)=>items.filter((candidate)=>!(candidate.sourceKind===item.sourceKind&&candidate.sourceId===item.sourceId)));setAvailableItems((items)=>[item,...items]);setMessage(error instanceof Error?error.message:"Could not attach item.");}
  }
  async function removeItem(item:ChapterHubItem){
    setPinnedItems((items)=>items.filter((candidate)=>candidate.id!==item.id));setAvailableItems((items)=>[item,...items]);
    try{await mutate({action:"remove_item",id:item.id});setMessage("Removed");}
    catch(error){setPinnedItems((items)=>[item,...items]);setAvailableItems((items)=>items.filter((candidate)=>candidate.sourceKind!==item.sourceKind||candidate.sourceId!==item.sourceId));setMessage(error instanceof Error?error.message:"Could not remove item.");}
  }

  return <div className={`chapter-hub-page chapter-hub-page--${mobileView}`} data-canonical-chapter-id={academic.chapterId}>
    <section className="chapter-hub-hero"><div className="chapter-hub-hero__copy"><div className="chapter-hub-hero__badges"><AcademicEntityMark kind="chapter" label={`Chapter ${academic.chapterNumber}`}/><Badge>{academic.paperLabel}</Badge></div><h1><b>{academic.chapterNumber}</b>{academic.chapterTitle}</h1><p>{academic.subjectTitle} · {academic.groupName}</p><div className="chapter-hub-actions"><Link href={`/study?${chapterQuery}`} className="ui-button ui-button--primary"><Icon name="timer" size={16}/> Start Focus</Link><Link href={`/subjects/${academic.subjectSlug}/progress?chapterId=${encodeURIComponent(academic.chapterId)}`} className="ui-button ui-button--secondary">Update progress</Link></div></div><div className="chapter-hub-hero__stats"><div><span>Progress</span><strong>{progressCount}/5</strong><small>{nextStage ? `Next: ${nextStage.label}` : "All stages complete"}</small></div><div><span>Focused</span><strong>{durationLabel(model.study.totalSeconds)}</strong><small>{model.study.sessionCount} sessions</small></div><div><span>Saved</span><strong>{model.notes.length + model.files.length}</strong><small>notes and files</small></div></div></section>
    <nav className="chapter-hub-mobile-tabs" aria-label="Chapter workspace view">{(["overview", "study", "resources"] as const).map((view) => <button type="button" key={view} aria-pressed={mobileView === view} onClick={() => setMobileView(view)}>{view.charAt(0).toUpperCase() + view.slice(1)}</button>)}</nav>

    <div className="chapter-hub-workspace">
      <main className="chapter-hub-main">
        <Card className="chapter-hub-section chapter-hub-controls" data-mobile-view="overview"><CardBody><SectionTitle icon="target" eyebrow="Chapter controls" title="Progress & understanding" action={<button type="button" className="ui-button ui-button--primary chapter-hub-controls-save" disabled={!controlsDirty} onClick={()=>void saveChapterControls()}>Save changes</button>}/><div className="chapter-hub-date-grid">{STAGES.map((stage)=><label key={stage.field} className={progress[stage.field]?"is-complete":"is-disabled"}><span>{stage.short}</span><input type="date" disabled={!progress[stage.field]} value={dateDrafts[stage.field]} onChange={(event)=>setDateDrafts((current)=>({...current,[stage.field]:event.target.value}))} aria-label={`${stage.label} date`}/></label>)}</div><label className="chapter-hub-understanding"><span><strong>Understanding</strong><small>Self-reported, not a mastery score</small></span><output>{understandingLevel}%</output><input type="range" min="0" max="100" step="1" value={understandingLevel} onChange={(event)=>setUnderstandingLevel(Number(event.target.value))} aria-label="Chapter understanding level"/></label>{message?<p className="chapter-hub-save-state" role="status">{message}</p>:null}</CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-study" data-mobile-view="study"><CardBody><SectionTitle icon="timer" eyebrow="Study history" title="Focus for this chapter" action={<Link href={`/study?${chapterQuery}`} className="chapter-hub-text-link">Start Focus <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-study-total"><strong>{durationLabel(model.study.totalSeconds)}</strong><span>{model.study.sessionCount} saved session{model.study.sessionCount === 1 ? "" : "s"} · Last studied: {dateLabel(lastStudyAt)}</span>{understanding !== null ? <small>Average self-reported understanding {Math.round(understanding)}% · not a mastery score</small> : null}</div><div className="chapter-hub-list">{model.study.recentSessions.length ? model.study.recentSessions.slice(0, 4).map((session) => <div key={session.id}><span><Icon name="clock" size={14}/><strong>{session.intendedTaskTitle ?? "General Focus"}</strong></span><small>{durationLabel(session.durationSeconds)} · {dateLabel(session.endedAt)}{session.understandingScore !== null ? ` · ${session.understandingScore}%` : ""}</small></div>) : <p>No Focus sessions for this chapter yet.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-topics" data-mobile-view="overview"><CardBody><SectionTitle icon="layers" eyebrow="Chapter structure" title="Topics & units"/>{model.topics.length ? <div className="chapter-hub-topic-grid">{model.topics.map((topic) => <span key={topic.id} data-academic-topic-id={topic.id}><b>{topic.unitNumber ?? "Unit"}</b>{topic.title}</span>)}</div> : <p className="chapter-hub-empty-line">No separately indexed topics are available.</p>}</CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-materials" data-mobile-view="resources"><CardBody><SectionTitle icon="book" eyebrow="Chapter material" title="Attached to this chapter"/><div className="chapter-hub-resource-tabs" role="tablist" aria-label="Resource source">{(["private","community","icai"] as const).map((tab)=><button type="button" role="tab" aria-selected={resourceTab===tab} key={tab} onClick={()=>setResourceTab(tab)}><span>{tab==="icai"?"ICAI":tab.charAt(0).toUpperCase()+tab.slice(1)}</span><small>{resourceCounts[tab]}</small></button>)}</div><input className="chapter-hub-resource-search" type="search" value={resourceQuery} onChange={(event)=>setResourceQuery(event.target.value)} placeholder={`Search ${resourceTab === "icai" ? "ICAI" : resourceTab} resources…`} aria-label="Search resources to attach"/><div className="chapter-hub-resource-results">{filteredAvailableItems.length?filteredAvailableItems.slice(0,40).map((item)=><div key={`${item.sourceKind}:${item.sourceId}`}><span><code>{resourceCode(item)}</code><strong>{item.title}</strong><small>{item.meta}</small></span><button type="button" className="ui-button ui-button--secondary" onClick={()=>void attachItem(item)}>Save to chapter</button></div>):<p>No matching {resourceTab === "icai" ? "ICAI" : resourceTab} resources.</p>}</div><div className="chapter-hub-pinned-list">{pinnedItems.length?pinnedItems.map((item)=><div key={item.id}><Link href={item.href}><span><code>{resourceCode(item)}</code><strong>{item.title}</strong><small>{item.meta}</small></span><Icon name="arrow" size={14}/></Link><button type="button" onClick={()=>void removeItem(item)} aria-label={`Remove ${item.title} from chapter`}><Icon name="close" size={14}/></button></div>):<p>Nothing attached yet.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-links" data-mobile-view="resources"><CardBody><SectionTitle icon="arrow" eyebrow="Useful links" title="Videos, revision & references"/><form className="chapter-hub-link-form" onSubmit={(event)=>void addLink(event)}><select value={linkDraft.kind} onChange={(event)=>setLinkDraft((draft)=>({...draft,kind:event.target.value as ChapterHubLink["kind"]}))} aria-label="Link type"><option value="useful">Useful link</option><option value="youtube">YouTube video</option><option value="revision">Revision link</option></select><input value={linkDraft.title} onChange={(event)=>setLinkDraft((draft)=>({...draft,title:event.target.value}))} placeholder="Title" maxLength={160} required/><input type="url" value={linkDraft.url} onChange={(event)=>setLinkDraft((draft)=>({...draft,url:event.target.value}))} placeholder="https://…" maxLength={2048} required/><button className="ui-button ui-button--primary" type="submit">Add link</button></form><div className="chapter-hub-link-list">{links.length?links.map((link)=><div key={link.id}><a href={link.url} target="_blank" rel="noreferrer"><Badge>{link.kind==="youtube"?"Video":link.kind}</Badge><span>{link.title}</span><Icon name="arrow" size={14}/></a><button type="button" aria-label={`Remove ${link.title}`} onClick={()=>{setLinks((items)=>items.filter((item)=>item.id!==link.id));void mutate({action:"remove_link",id:link.id}).catch(()=>setLinks((items)=>[link,...items]));}}><Icon name="close" size={14}/></button></div>):<p>No useful links added yet.</p>}</div></CardBody></Card>
      </main>

      <aside className="chapter-hub-rail">
        <Card className="chapter-hub-section chapter-hub-tests" data-mobile-view="overview"><CardBody><SectionTitle icon="tests" eyebrow="Tests" title="Attempts" action={<Link href={`/tests?${chapterQuery}`} className="chapter-hub-text-link">Record marks <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-test-list">{(["test_1_at", "test_2_at"] as const).map((field, index) => <div key={field} className={progress[field] ? "is-complete" : ""}><span>{progress[field] ? <Icon name="check" size={15}/> : `Test ${index + 1}`}</span><div><strong>Test {index + 1}</strong><small>{progress[field] ? dateLabel(progress[field]) : "Not completed"}</small></div></div>)}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-activity" data-mobile-view="overview"><CardBody><SectionTitle icon="clock" eyebrow="Recent" title="Chapter activity"/><div className="chapter-hub-activity-list">{activity.length ? activity.map((item) => <div key={item.id}><span><Icon name={item.icon} size={14}/></span><div><strong>{item.title}</strong><small>{dateLabel(item.at)}</small></div></div>) : <p>No chapter activity yet.</p>}</div></CardBody></Card>



        <Card className="chapter-hub-section chapter-hub-doubts" data-mobile-view="resources"><CardBody><SectionTitle icon="community" eyebrow="Doubts" title="Ask your subject room" action={<Link href="/community" className="chapter-hub-text-link">Community <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-content-list">{model.doubtChannels.length ? model.doubtChannels.map((channel) => <Link key={channel.id} href={`/community/${channel.channelKey}?chapterId=${encodeURIComponent(academic.chapterId)}`}><span><strong>{channel.title}</strong><small>{channel.description}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No subject-specific doubt room is available.</p>}</div></CardBody></Card>
      </aside>
    </div>
  </div>;
}
