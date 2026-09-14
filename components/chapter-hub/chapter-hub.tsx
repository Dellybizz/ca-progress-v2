"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import type { ChapterHubReadyModel } from "@/lib/chapter-hub/types";
import type { ProgressState } from "@/lib/progress/types";
import { AcademicContextBar, AcademicEntityMark } from "@/components/academic/academic-navigation";

const STAGES: Array<{ field: keyof ProgressState; label: string; short: string }> = [
  { field: "completed_at", label: "Completed", short: "Done" }, { field: "revision_1_at", label: "Revision 1", short: "Rev. 1" },
  { field: "revision_2_at", label: "Revision 2", short: "Rev. 2" }, { field: "test_1_at", label: "Test 1", short: "Test 1" }, { field: "test_2_at", label: "Test 2", short: "Test 2" },
];
function dateLabel(value: string | null) { if (!value) return "Not yet"; return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function durationLabel(seconds: number) { const minutes = Math.round(seconds / 60); if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; return rest ? `${hours}h ${rest}m` : `${hours}h`; }
function fileSize(bytes: number) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function SectionTitle({ icon, eyebrow, title, action }: { icon: IconName; eyebrow: string; title: string; action?: React.ReactNode }) { return <header className="chapter-hub-section__header"><div className="chapter-hub-section__title"><span><Icon name={icon} size={18}/></span><div><small>{eyebrow}</small><h2>{title}</h2></div></div>{action}</header>; }

export function ChapterHub({ model }: { model: ChapterHubReadyModel }) {
  const [mobileView, setMobileView] = useState<"overview" | "study" | "resources">("overview");
  const { academic } = model;
  const progressCount = STAGES.filter((stage) => Boolean(model.progress[stage.field])).length;
  const chapterQuery = `chapterId=${encodeURIComponent(academic.chapterId)}&subjectId=${encodeURIComponent(academic.subjectId)}`;
  const lastStudyAt = model.study.recentSessions[0]?.endedAt ?? null;
  const understanding = model.study.averageSelfReportedUnderstanding;
  const nextStage = STAGES.find((stage) => !model.progress[stage.field]);
  const activity = [
    ...model.progressEvents.map((event) => ({ id: `progress-${event.id}`, at: event.createdAt, icon: "target" as IconName, title: `${event.stage.replaceAll("_", " ")} ${event.action}` })),
    ...model.study.recentSessions.map((session) => ({ id: `study-${session.id}`, at: session.endedAt, icon: "timer" as IconName, title: `${durationLabel(session.durationSeconds)} Focus session` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);

  return <div className={`chapter-hub-page chapter-hub-page--${mobileView}`} data-canonical-chapter-id={academic.chapterId}>
    <section className="chapter-hub-hero"><div className="chapter-hub-hero__copy"><div className="chapter-hub-hero__badges"><AcademicEntityMark kind="chapter" label={`Chapter ${academic.chapterNumber}`}/><Badge>{academic.paperLabel}</Badge></div><h1><b>{academic.chapterNumber}</b>{academic.chapterTitle}</h1><p>{academic.subjectTitle} · {academic.groupName}</p><div className="chapter-hub-actions"><Link href={`/study?${chapterQuery}`} className="ui-button ui-button--primary"><Icon name="timer" size={16}/> Start Focus</Link><Link href={`/subjects/${academic.subjectSlug}/progress?chapterId=${encodeURIComponent(academic.chapterId)}`} className="ui-button ui-button--secondary">Update progress</Link></div></div><div className="chapter-hub-hero__stats"><div><span>Progress</span><strong>{progressCount}/5</strong><small>{nextStage ? `Next: ${nextStage.label}` : "All stages complete"}</small></div><div><span>Focused</span><strong>{durationLabel(model.study.totalSeconds)}</strong><small>{model.study.sessionCount} sessions</small></div><div><span>Saved</span><strong>{model.notes.length + model.files.length}</strong><small>notes and files</small></div></div></section>
    <AcademicContextBar level={academic.levelName} group={academic.groupName} attempt={model.attemptKey} syllabus={academic.syllabusVersionKey}/>
    <nav className="chapter-hub-mobile-tabs" aria-label="Chapter workspace view">{(["overview", "study", "resources"] as const).map((view) => <button type="button" key={view} aria-pressed={mobileView === view} onClick={() => setMobileView(view)}>{view.charAt(0).toUpperCase() + view.slice(1)}</button>)}</nav>

    <div className="chapter-hub-workspace">
      <main className="chapter-hub-main">
        <Card className="chapter-hub-section chapter-hub-progress" data-mobile-view="overview"><CardBody><SectionTitle icon="target" eyebrow="Progress" title="Chapter stages" action={<Link href={`/subjects/${academic.subjectSlug}/progress?chapterId=${encodeURIComponent(academic.chapterId)}`} className="chapter-hub-text-link">Open tracker <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-stage-grid">{STAGES.map((stage) => { const completedAt = model.progress[stage.field]; return <div key={stage.field} className={completedAt ? "is-complete" : ""}><span>{completedAt ? <Icon name="check" size={14}/> : stage.short}</span><strong>{stage.label}</strong><small>{dateLabel(completedAt)}</small></div>; })}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-study" data-mobile-view="study"><CardBody><SectionTitle icon="timer" eyebrow="Study history" title="Focus for this chapter" action={<Link href={`/study?${chapterQuery}`} className="chapter-hub-text-link">Start Focus <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-study-total"><strong>{durationLabel(model.study.totalSeconds)}</strong><span>{model.study.sessionCount} saved session{model.study.sessionCount === 1 ? "" : "s"} · Last studied: {dateLabel(lastStudyAt)}</span>{understanding !== null ? <small>Average self-reported understanding {Math.round(understanding)}% · not a mastery score</small> : null}</div><div className="chapter-hub-list">{model.study.recentSessions.length ? model.study.recentSessions.slice(0, 4).map((session) => <div key={session.id}><span><Icon name="clock" size={14}/><strong>{session.intendedTaskTitle ?? "General Focus"}</strong></span><small>{durationLabel(session.durationSeconds)} · {dateLabel(session.endedAt)}{session.understandingScore !== null ? ` · ${session.understandingScore}%` : ""}</small></div>) : <p>No Focus sessions for this chapter yet.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-topics" data-mobile-view="overview"><CardBody><SectionTitle icon="layers" eyebrow="Chapter structure" title="Topics & units"/>{model.topics.length ? <div className="chapter-hub-topic-grid">{model.topics.map((topic) => <span key={topic.id} data-academic-topic-id={topic.id}><b>{topic.unitNumber ?? "Unit"}</b>{topic.title}</span>)}</div> : <p className="chapter-hub-empty-line">No separately indexed topics are available.</p>}</CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-official" data-mobile-view="resources"><CardBody><SectionTitle icon="shield" eyebrow="Official ICAI resources" title="Verified material" action={<Link href={`/resources?${chapterQuery}`} className="chapter-hub-text-link">Browse all <Icon name="arrow" size={13}/></Link>}/>{model.officialResources.length ? <div className="chapter-hub-official-grid">{model.officialResources.map((resource) => <Link key={resource.canonicalResourceId} href={`/resources/${encodeURIComponent(resource.canonicalResourceId)}/open`} data-canonical-resource-id={resource.canonicalResourceId}><span className="chapter-hub-resource-icon"><Icon name="book" size={18}/></span><span><Badge>{resource.resourceType.replaceAll("_", " ")}</Badge><strong>{resource.title}</strong><small>{resource.sourceName} · verified {dateLabel(resource.lastVerifiedAt)}</small></span><Icon name="arrow" size={15}/></Link>)}</div> : <p className="chapter-hub-empty-line">No verified official resources are available for this subject and attempt.</p>}</CardBody></Card>
      </main>

      <aside className="chapter-hub-rail">
        <Card className="chapter-hub-section chapter-hub-tests" data-mobile-view="overview"><CardBody><SectionTitle icon="tests" eyebrow="Tests" title="Milestones" action={<Link href={`/tests?${chapterQuery}`} className="chapter-hub-text-link">Open tests <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-test-list">{(["test_1_at", "test_2_at"] as const).map((field, index) => <div key={field} className={model.progress[field] ? "is-complete" : ""}><span>{model.progress[field] ? <Icon name="check" size={15}/> : `Test ${index + 1}`}</span><div><strong>Test {index + 1}</strong><small>{model.progress[field] ? dateLabel(model.progress[field]) : "Not completed"}</small></div></div>)}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-activity" data-mobile-view="overview"><CardBody><SectionTitle icon="clock" eyebrow="Recent" title="Chapter activity"/><div className="chapter-hub-activity-list">{activity.length ? activity.map((item) => <div key={item.id}><span><Icon name={item.icon} size={14}/></span><div><strong>{item.title}</strong><small>{dateLabel(item.at)}</small></div></div>) : <p>No chapter activity yet.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-notes" data-mobile-view="resources"><CardBody><SectionTitle icon="notes" eyebrow="Notes" title="Your notes" action={<Link href={`/notes?${chapterQuery}`} className="chapter-hub-text-link">Open notes <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-content-list">{model.notes.length ? model.notes.slice(0, 4).map((note) => <Link key={note.id} href={`/notes/${note.id}`}><span><strong>{note.title}</strong><small>{note.excerpt || "No preview"}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No notes linked to this chapter.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-files" data-mobile-view="resources"><CardBody><SectionTitle icon="book" eyebrow="Files" title="Chapter library" action={<Link href={`/resources?${chapterQuery}`} className="chapter-hub-text-link">Open library <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-content-list">{model.files.length ? model.files.slice(0, 4).map((file) => <Link key={file.id} href={`/resources/${file.id}`}><span><strong>{file.title}</strong><small>{file.extension.toUpperCase()} · {fileSize(file.sizeBytes)}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No files linked to this chapter.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-doubts" data-mobile-view="resources"><CardBody><SectionTitle icon="community" eyebrow="Doubts" title="Ask your subject room" action={<Link href="/community" className="chapter-hub-text-link">Community <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-content-list">{model.doubtChannels.length ? model.doubtChannels.map((channel) => <Link key={channel.id} href={`/community/${channel.channelKey}?chapterId=${encodeURIComponent(academic.chapterId)}`}><span><strong>{channel.title}</strong><small>{channel.description}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No subject-specific doubt room is available.</p>}</div></CardBody></Card>
      </aside>
    </div>
  </div>;
}
