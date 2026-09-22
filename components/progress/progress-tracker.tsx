"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ProgressChapter, ProgressReadyModel, ProgressStage, ProgressState } from "@/lib/progress/types";

const STAGES: Array<{ key: ProgressStage; label: string; short: string }> = [
  { key: "completed", label: "First Completion", short: "Done" },
  { key: "revision_1", label: "Revision 1", short: "Rev. 1" },
  { key: "revision_2", label: "Revision 2", short: "Rev. 2" },
  { key: "test_1", label: "Test 1", short: "Test 1" },
  { key: "test_2", label: "Test 2", short: "Test 2" },
];

const PROGRESS_SYNC_EVENT = "ca-progress:chapter-sync";
function readSyncedProgress(chapterId:string):ProgressState|null{
  if(typeof window==="undefined")return null;
  try{const value=sessionStorage.getItem(`ca-progress:chapter:${chapterId}`);return value?JSON.parse(value) as ProgressState:null;}catch{return null;}
}
function writeSyncedProgress(chapterId:string,state:ProgressState){
  try{sessionStorage.setItem(`ca-progress:chapter:${chapterId}`,JSON.stringify(state));window.dispatchEvent(new CustomEvent(PROGRESS_SYNC_EVENT,{detail:{chapterId,state}}));}catch{}
}

const fieldForStage: Record<ProgressStage, keyof ProgressState> = {
  completed: "completed_at",
  revision_1: "revision_1_at",
  revision_2: "revision_2_at",
  test_1: "test_1_at",
  test_2: "test_2_at",
};

function stageEnabled(state: ProgressState, stage: ProgressStage) {
  return Boolean(state[fieldForStage[stage]]);
}

function stageLocked(state: ProgressState, stage: ProgressStage) {
  if (stage === "revision_1" || stage === "test_1") return !state.completed_at;
  if (stage === "revision_2") return !state.revision_1_at;
  if (stage === "test_2") return !state.test_1_at;
  return false;
}

function clearLocked(state: ProgressState, stage: ProgressStage) {
  if (stage === "completed") return Boolean(state.revision_1_at || state.test_1_at);
  if (stage === "revision_1") return Boolean(state.revision_2_at);
  return false;
}

function optimisticState(state: ProgressState, stage: ProgressStage, enabled: boolean): ProgressState {
  return { ...state, [fieldForStage[stage]]: enabled ? new Date().toISOString() : null };
}

function isTestStage(stage: ProgressStage): stage is "test_1" | "test_2" {
  return stage === "test_1" || stage === "test_2";
}

function shortSubjectTitle(title: string) {
  const labels: Record<string, string> = {
    "Financial Management and Strategic Management": "FM SM",
    "Cost and Management Accounting": "Costing",
    "Auditing and Ethics": "Audit",
    "Corporate and Other Laws": "Law",
  };
  return labels[title] ?? title;
}

function sectionTitle(subjectTitle: string, sectionKey: string | null) {
  if (!sectionKey) return null;
  const key = sectionKey.toLocaleLowerCase().replaceAll("_", "-");
  if (subjectTitle === "Taxation") {
    if (/gst|goods|indirect/.test(key)) return "Goods and Service Tax (IDT)";
    if (/income|direct/.test(key)) return "Income Tax (DT)";
  }
  if (subjectTitle === "Financial Management and Strategic Management") {
    if (/strategic|strategy/.test(key)) return "Strategic Management";
    if (/financial|finance/.test(key)) return "Financial Management";
  }
  return null;
}

export function ProgressTracker({
  model,
  subjectLocked = false,
  initialChapterId,
}: {
  model: ProgressReadyModel;
  subjectLocked?: boolean;
  initialChapterId?: string;
}) {
  const router = useRouter();
  const initialChapter = initialChapterId ? model.chapters.find((chapter) => chapter.id === initialChapterId) ?? null : null;
  const [chapters, setChapters] = useState(model.chapters);
  const [savedChapters, setSavedChapters] = useState(model.chapters);
  const [query, setQuery] = useState(initialChapter ? `${initialChapter.number} ${initialChapter.title}` : "");
  const [subject, setSubject] = useState(subjectLocked && model.chapters[0] ? model.chapters[0].subjectId : "all");
  const [group, setGroup] = useState("all");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(()=>{
    const apply=()=>{setChapters((items)=>items.map((item)=>{const state=readSyncedProgress(item.id);return state?{...item,state}:item;}));setSavedChapters((items)=>items.map((item)=>{const state=readSyncedProgress(item.id);return state?{...item,state}:item;}));};
    apply();window.addEventListener(PROGRESS_SYNC_EVENT,apply);return()=>window.removeEventListener(PROGRESS_SYNC_EVENT,apply);
  },[]);

  const dirty = useMemo(() => chapters.some((chapter) => {
    const saved=savedChapters.find((item)=>item.id===chapter.id);
    return !saved || JSON.stringify(saved.state)!==JSON.stringify(chapter.state);
  }), [chapters,savedChapters]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(!dirty)return;event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);

  const subjects = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    chapters.forEach((chapter) => map.set(chapter.subjectId, { id: chapter.subjectId, title: chapter.subjectTitle }));
    return [...map.values()];
  }, [chapters]);
  const groups = useMemo(
    () => [...new Map(chapters.map((chapter) => [chapter.groupCode, { code: chapter.groupCode, name: chapter.groupName }])).values()],
    [chapters],
  );
  const filtered = useMemo(() => chapters.filter((chapter) => {
    if (subject !== "all" && chapter.subjectId !== subject) return false;
    if (group !== "all" && chapter.groupCode !== group) return false;
    const q = query.trim().toLocaleLowerCase();
    return !q || `${chapter.number} ${chapter.title} ${chapter.subjectTitle}`.toLocaleLowerCase().includes(q);
  }), [chapters, group, query, subject]);
  const grouped = useMemo(() => [...new Map(filtered.map((chapter) => [chapter.subjectId, { title: chapter.subjectTitle, chapters: filtered.filter((item) => item.subjectId === chapter.subjectId) }])).values()].map((item) => ({ ...item, sections: [...new Map(item.chapters.map((chapter) => [sectionTitle(item.title, chapter.sectionKey) ?? "", { title: sectionTitle(item.title, chapter.sectionKey), chapters: item.chapters.filter((candidate) => (sectionTitle(item.title, candidate.sectionKey) ?? "") === (sectionTitle(item.title, chapter.sectionKey) ?? "")) }])).values()] })), [filtered]);

  function mutate(chapter: ProgressChapter, stage: ProgressStage) {
    if (isTestStage(stage)) {
      if(dirty && !window.confirm("You have unsaved progress changes. Leave without saving them?"))return;
      router.push(`/tests?chapterId=${encodeURIComponent(chapter.id)}&stage=${stage}`);
      return;
    }
    const enabled = !stageEnabled(chapter.state, stage);
    if ((enabled && stageLocked(chapter.state, stage)) || (!enabled && clearLocked(chapter.state, stage))) return;
    setSaveState("idle");
    setMessage(null);
    setChapters((items)=>items.map((item)=>item.id===chapter.id?{...item,state:optimisticState(item.state,stage,enabled)}:item));
  }

  async function saveChanges(){
    const changes:{chapterId:string;stage:ProgressStage;enabled:boolean}[]=[];
    for(const chapter of chapters){
      const saved=savedChapters.find((item)=>item.id===chapter.id);
      if(!saved)continue;
      for(const stage of STAGES){
        if(isTestStage(stage.key))continue;
        const enabled=stageEnabled(chapter.state,stage.key);
        if(enabled!==stageEnabled(saved.state,stage.key))changes.push({chapterId:chapter.id,stage:stage.key,enabled});
      }
    }
    if(!changes.length)return;
    setSaveState("saving");setMessage(null);
    try{
      const response=await fetch("/api/v1/progress",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"set_stages",changes})});
      const payload=await response.json() as {states?:Array<{chapter_id:string;state:ProgressState;saved_at:string}>;error?:string};
      if(!response.ok)throw new Error(payload.error||"Progress could not be saved.");
      const states=new Map((payload.states??[]).map((row)=>[row.chapter_id,row]));
      const committed=chapters.map((chapter)=>{const row=states.get(chapter.id);return row?{...chapter,state:row.state,updatedAt:row.saved_at}:chapter;});
      for(const chapter of committed)if(states.has(chapter.id))writeSyncedProgress(chapter.id,chapter.state);setChapters(committed);setSavedChapters(committed);setSaveState("saved");setMessage("All changes saved.");router.refresh();
    }catch(error){setSaveState("error");setMessage(error instanceof Error?error.message:"Progress could not be saved.");}
  }
  function discardChanges(){setChapters(savedChapters);setSaveState("idle");setMessage(null);}
  function exportRows(){
    return chapters.map((chapter)=>({Subject:shortSubjectTitle(chapter.subjectTitle),Chapter:`${chapter.number}. ${chapter.title}`,Done:chapter.state.completed_at?.slice(0,10)??"",["Rev. 1"]:chapter.state.revision_1_at?.slice(0,10)??"",["Rev. 2"]:chapter.state.revision_2_at?.slice(0,10)??"",["Test 1"]:chapter.state.test_1_at?.slice(0,10)??"",["Test 2"]:chapter.state.test_2_at?.slice(0,10)??""}));
  }
  function excelEscape(value:string){return value.replace(/[&<>"]/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[character]??character));}
  function downloadExcel(){
    const rows=exportRows();
    const stageKeys=["Done","Rev. 1","Rev. 2","Test 1","Test 2"] as const;
    const report=`<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;color:#111827}.title{font-size:22px;font-weight:700;color:#3325a8}.meta{color:#667085;font-size:11px;margin-bottom:16px}
      table{border-collapse:collapse;table-layout:fixed;width:100%}th{background:#5b50d8;color:#fff;font-weight:700;text-align:left}th,td{border:1px solid #d8dbe8;padding:7px 9px;vertical-align:middle}
      col.subject{width:150px}col.chapter{width:340px}col.date{width:92px}tbody tr:nth-child(even) td{background:#f8f9fc}
    </style></head><body>
    <div class="title">CA Progress Report</div><div class="meta">Generated ${excelEscape(new Date().toLocaleString("en-IN"))} · ${rows.length} chapters</div>
    <table><colgroup><col class="subject"><col class="chapter">${stageKeys.map(()=>'<col class="date">').join("")}</colgroup><thead><tr><th>Subject</th><th>Chapter</th>${stageKeys.map((stage)=>`<th>${stage}</th>`).join("")}</tr></thead><tbody>${rows.map((row)=>`<tr><td>${excelEscape(row.Subject)}</td><td>${excelEscape(row.Chapter)}</td>${stageKeys.map((stage)=>`<td>${excelEscape(row[stage])}</td>`).join("")}</tr>`).join("")}</tbody></table>
    </body></html>`;
    const url=URL.createObjectURL(new Blob(["\ufeff",report],{type:"application/vnd.ms-excel;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="ca-progress-report.xls";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  }

  return (
    <div className="progress-workspace">
      {!subjectLocked && groups.length > 1 ? <nav className="progress-group-tabs" aria-label="Group"><button type="button" className={group === "all" ? "is-active" : ""} onClick={() => setGroup("all")}>Both groups</button>{groups.map((item) => <button type="button" key={item.code} className={group === item.code ? "is-active" : ""} onClick={() => { setGroup(item.code); setSubject("all"); }}>{item.name}</button>)}</nav> : null}
      {!subjectLocked ? <nav className="progress-subject-tabs" aria-label="Subject"><span>Subjects</span><button type="button" className={subject === "all" ? "is-active" : ""} onClick={() => setSubject("all")}>All subjects</button>{subjects.filter((item) => group === "all" || chapters.some((chapter) => chapter.subjectId === item.id && chapter.groupCode === group)).map((item) => <button type="button" key={item.id} className={subject === item.id ? "is-active" : ""} onClick={() => setSubject(item.id)}>{shortSubjectTitle(item.title)}</button>)}</nav> : null}
      <div className="progress-action-bar"><label className="progress-search progress-search--standalone"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters" /></label><div className="progress-export-actions"><button type="button" onClick={downloadExcel}>Download Excel</button></div><div className="progress-draft-actions"><button type="button" className="ui-button ui-button--secondary" disabled={!dirty||saveState==="saving"} onClick={discardChanges}>Discard</button><button type="button" className="ui-button ui-button--primary" disabled={!dirty||saveState==="saving"} onClick={()=>void saveChanges()}>{saveState==="saving"?"Saving…":"Save changes"}</button></div></div>

      {message ? <div className={`progress-save-error${saveState==="saved"?" progress-save-state--saved":""}`} role="status"><span><Icon name="bell" size={15}/>{message}</span></div> : null}

      {filtered.length ? <div className="progress-subject-sections">{grouped.map((subjectSection) => <section className="progress-subject-section" key={subjectSection.title}><h2>{shortSubjectTitle(subjectSection.title)}</h2>{subjectSection.sections.map((section) => <div className="progress-syllabus-section" key={section.title ?? "chapters"}>{section.title ? <h3>{section.title}</h3> : null}<div className="progress-chapter-list">{section.chapters.map((chapter) => (
        <article className="progress-chapter-card" key={chapter.id} data-canonical-chapter-id={chapter.id}>
          <div className="progress-chapter-heading">
            <h3><b>{chapter.number}</b>{chapter.title}</h3>
            <Link href={`/chapters/${chapter.id}`}><span className="progress-hub-label--desktop">Go to Chapter Hub</span><span className="progress-hub-label--mobile">Chapter Hub</span><Icon name="arrow" size={12}/></Link>
          </div>
          <div className="progress-stage-controls" role="group" aria-label={`${chapter.title} stages`}>
            {STAGES.map((stage) => {
              const active = stageEnabled(chapter.state, stage.key);
              const testStage = isTestStage(stage.key);
              const locked = !active && stageLocked(chapter.state, stage.key)
                ? true
                : !testStage && active ? clearLocked(chapter.state, stage.key) : false;
              const title = locked
                ? "Complete the required earlier stage first."
                : testStage
                  ? active ? `Open saved ${stage.label} marks` : `Record ${stage.label} marks`
                  : stage.label;
              return <button
                key={stage.key}
                type="button"
                className={active ? "is-active" : ""}
                disabled={locked}
                onClick={() => void mutate(chapter, stage.key)}
                title={title}
                aria-pressed={active}
                aria-label={`${stage.label}${active ? ", completed" : ""}`}
              >
                <span>{stage.short}</span>
                {locked ? <Icon name="lock" size={12}/> : active ? <Icon name="check" size={12}/> : testStage ? <Icon name="arrow" size={12}/> : null}
              </button>;
            })}
          </div>
        </article>
      ))}</div></div>)}</section>)}</div> : <div className="progress-empty"><Icon name="search"/><h3>No chapters match these filters</h3><p>Clear the search or broaden the subject/group selection.</p></div>}

    </div>
  );
}
