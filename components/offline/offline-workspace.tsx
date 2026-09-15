"use client";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { useEffect, useState } from "react";
import { StudentContextProvider } from "@/components/academic/student-context-provider";
import type { StudentContextContract } from "@/lib/academic/student-context";
import { getOfflineIdentity, getOfflineSnapshots, setOfflineIdentity } from "@/lib/offline/database";
import { projectedSnapshot } from "@/lib/offline/mutation";
import { OfflineControls } from "./offline-controls";
import { OfflineRuntime } from "./offline-runtime";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { ProgressPage } from "@/components/progress/progress-page";
import { NoteEditor } from "@/components/resources/note-editor";
import { StudyTimer } from "@/components/study/study-timer";
import { PlannerClient } from "@/components/planner/planner-client";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { SyllabusExplorer } from "@/components/academic/syllabus-explorer";
import type { DashboardPageModel } from "@/lib/dashboard/types";
import type { ProgressPageModel } from "@/lib/progress/types";
import type { StudyReadyModel } from "@/lib/study/types";
import type { PlannerReadyModel } from "@/lib/planner/types";
import type { ResourceLibraryReady } from "@/lib/resources/types";
import type { AcademicCatalog } from "@/lib/academic/types";
const KINDS = ["dashboard", "syllabus", "progress", "study", "planner", "notes", "resources"];

export function OfflineWorkspace() {
  const [context, setContext] = useState<StudentContextContract | null>(null);
  const [kind, setKind] = useState("dashboard");
  const [data, setData] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!OFFLINE_ENABLED) return;
    let cancelled = false;
    async function load() {
      const identity = await getOfflineIdentity();
      if (!identity) { if (!cancelled) { setContext(null); setData(null); setError("Open a student page while signed in to enable offline access on this device."); } return; }
      if (navigator.onLine) {
        const response = await fetch("/api/offline/context", { cache: "no-store" }).catch(() => null);
        if (response?.ok) {
          const current = await response.json() as StudentContextContract;
          if (current.userId !== identity.userId || current.contextKey !== identity.contextKey) { await setOfflineIdentity(null); if (!cancelled) { setContext(null); setData(null); setError("Your account or academic selection changed. Open a student page online."); } return; }
        }
      }
      const selected = KINDS.includes(location.pathname.split("/")[1]) ? location.pathname.split("/")[1] : kind;
      const model = await projectedSnapshot(identity.userId, identity.contextKey, selected);
      const snapshots = await getOfflineSnapshots(identity.userId);
      if (!cancelled) { setKind(selected); setContext(previous => previous?.contextKey === identity.contextKey ? previous : identity.context as StudentContextContract); setData(model); setError(null); setSavedAt(snapshots.find(row => row.kind === `${identity.contextKey}:${selected}`)?.savedAt ?? ""); }
    }
    const update = () => void load().catch(() => { if (!cancelled) setError("Offline data could not be opened. Your browser may have blocked or removed local storage."); });
    update();
    window.addEventListener("offline-data-change", update);
    const locked = (event: MessageEvent) => { if (event.data?.type === "OFFLINE_LOCKED") { setContext(null); setData(null); setError("Offline access is locked. Sign in again to open your data."); } };
    navigator.serviceWorker?.addEventListener("message", locked);
    return () => { cancelled = true; window.removeEventListener("offline-data-change", update); navigator.serviceWorker?.removeEventListener("message", locked); };
  }, [kind]);
  if (!OFFLINE_ENABLED) return <main className="offline-workspace"><h1>Offline access is not enabled yet</h1><a href="/dashboard">Open dashboard</a></main>;
  return <main className="offline-workspace"><h1>Study on this device</h1><p>Cached data may be out of date. Pending edits remain here until synchronization succeeds.</p>{error ? <p role="alert">{error} <a href="/dashboard">Open dashboard</a></p> : null}
    {context ? <StudentContextProvider value={context}><OfflineRuntime/><OfflineControls/>
      <nav aria-label="Saved student screens" className="phase11-header-links">{KINDS.map(name => <a key={name} href={`/${name}`}>{name[0].toUpperCase() + name.slice(1)}</a>)}</nav>
      <p role="status">{savedAt ? `Snapshot saved ${new Date(savedAt).toLocaleString()}` : "This screen has not been saved yet. Open it online first."}</p>
      {data ? <div key={`${context.contextKey}:${kind}`}>
        {kind === "dashboard" ? <StudentDashboard model={data as DashboardPageModel}/> : null}
        {kind === "syllabus" ? <SyllabusExplorer catalog={data as AcademicCatalog}/> : null}
        {kind === "progress" ? <ProgressPage model={data as ProgressPageModel}/> : null}
        {kind === "study" && (data as StudyReadyModel).mode === "ready" ? <StudyTimer model={data as StudyReadyModel}/> : null}
        {kind === "planner" && (data as PlannerReadyModel).mode === "ready" ? <PlannerClient model={data as PlannerReadyModel}/> : null}
        {(kind === "notes" || kind === "resources") && (data as ResourceLibraryReady).mode === "ready" ? <><ResourceLibrary model={data as ResourceLibraryReady} initialTab="my"/>{kind === "notes" && (data as ResourceLibraryReady).myNotes.find(note => note.id === location.pathname.split("/")[2]) ? <NoteEditor note={(data as ResourceLibraryReady).myNotes.find(note => note.id === location.pathname.split("/")[2])} subjects={(data as ResourceLibraryReady).subjects} availableUploads={(data as ResourceLibraryReady).myUploads}/> : null}</> : null}
      </div> : null}
    </StudentContextProvider> : null}
  </main>;
}
