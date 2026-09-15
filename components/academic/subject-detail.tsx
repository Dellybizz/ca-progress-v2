import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { AcademicSubject } from "@/lib/academic/types";
import type { ProgressReadyModel, ProgressState } from "@/lib/progress/types";
import { AcademicBreadcrumbs, AcademicContextBar, AcademicEntityMark } from "./academic-navigation";

function sectionLabel(value: string) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

const progressSignals: Array<{ key: keyof ProgressState; short: string; label: string }> = [
  { key: "completed_at", short: "C", label: "Completed" },
  { key: "revision_1_at", short: "R1", label: "Revision 1" },
  { key: "revision_2_at", short: "R2", label: "Revision 2" },
  { key: "test_1_at", short: "T1", label: "Test 1" },
  { key: "test_2_at", short: "T2", label: "Test 2" },
];

export function SubjectDetail({ subject, progress, context }: { subject: AcademicSubject; progress?: ProgressReadyModel | null; context?: { level?: string | null; group?: string | null; attempt?: string | null } }) {
  const progressByChapter = new Map(progress?.chapters.map((chapter) => [chapter.id, chapter.state]) ?? []);
  const summary = progress?.analytics.subjects[0];
  const activeChapter = progress?.chapters.find((chapter) => chapter.state.completed_at && !chapter.state.revision_1_at) ?? progress?.chapters.find((chapter) => !chapter.state.completed_at) ?? progress?.chapters[0];
  return <div className="academic-page academic-subject-page" id="top">
    <span className="sr-only">Canonical Chapter Hubs are live and connected to this subject workspace.</span>
    <AcademicBreadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Syllabus", href: "/syllabus" }, { label: subject.title }]}/>
    <AcademicContextBar level={context?.level || subject.paperLabel} group={context?.group} attempt={context?.attempt} syllabus={subject.version.title}/>
    <section className="academic-subject-hero academic-subject-hero--workspace">
      <div>
        <div className="academic-subject-hero__badges"><AcademicEntityMark label={subject.paperLabel}/><Badge tone={subject.version.status === "published" ? "success" : "neutral"}>{subject.version.status}</Badge></div>
        <h1>{subject.title}</h1>
        <p>{subject.version.title}. Pick up the next chapter, record milestones, or open the full syllabus structure.</p>
        <div className="academic-subject-actions"><Link className="ui-button ui-button--primary" href={activeChapter ? `/chapters/${activeChapter.id}` : "#chapters"}>{activeChapter?.state.completed_at ? "Continue subject" : "Start next chapter"}</Link><Link className="ui-button" href={`/subjects/${subject.slug}/progress`}>Manage progress</Link></div>
      </div>
      <Card className="academic-version-card academic-subject-status"><CardBody><span className="eyebrow">Subject status</span><strong>{summary ? `${summary.completedCount} of ${summary.chapterCount} chapters complete` : `${subject.chapters.length} chapters`}</strong><div className="academic-subject-status__meter"><span style={{ width: `${summary?.completionPercent ?? 0}%` }}/></div><small>{summary ? `${summary.revisionPercent}% of revision checkpoints recorded` : `Syllabus ${subject.version.key}`}</small><a href={subject.version.sourceUrl} target="_blank" rel="noreferrer">Official ICAI source <Icon name="arrow" size={14}/></a></CardBody></Card>
    </section>

    <section className="academic-chapter-list-section" id="chapters">
      <div className="academic-section-heading"><div><span className="eyebrow">Academic structure</span><h2>{subject.kind === "case_study" ? "Integrated units" : "Chapters & units"}</h2></div><Badge>{subject.chapters.length} rows</Badge></div>
      {subject.chapters.length ? <div className="academic-chapter-rows">{subject.chapters.map((chapter) => { const state = progressByChapter.get(chapter.id); return <article key={chapter.id} id={chapter.id} className="academic-chapter-row academic-chapter-row--workspace" data-academic-chapter-id={chapter.id}>
        <div className="academic-chapter-row__number"><span>{chapter.number}</span></div>
        <div className="academic-chapter-row__content"><div className="academic-chapter-row__heading"><div><h3>{chapter.title}</h3>{chapter.sectionKey ? <small>{sectionLabel(chapter.sectionKey)}</small> : null}</div><Badge tone={chapter.kind === "special_unit" ? "warning" : "neutral"}>{chapter.kind === "special_unit" ? "Special unit" : "Chapter"}</Badge></div>
        <div className="academic-chapter-signal-row" aria-label={`${chapter.title} progress`}>{progressSignals.map((signal) => <span key={signal.key} className={state?.[signal.key] ? "is-complete" : ""} title={signal.label}>{state?.[signal.key] ? <Icon name="check" size={11}/> : signal.short}<small>{signal.label}</small></span>)}</div>
        {chapter.topics.length ? <details className="academic-topic-disclosure"><summary>{chapter.topics.length} units and topics</summary><div className="academic-topic-chips">{chapter.topics.map((topic) => <span key={topic.id} data-academic-topic-id={topic.id}><b>{topic.unitNumber ?? "Unit"}</b>{topic.title}{topic.kind === "accounting_standard" ? <i>AS</i> : null}</span>)}</div></details> : null}</div>
        <div className="academic-chapter-row__future"><Link href={`/chapters/${chapter.id}`}>Open chapter <Icon name="arrow" size={13}/></Link><Link href={`/study?subjectId=${subject.id}&chapterId=${chapter.id}`}>Focus</Link></div>
      </article>})}</div> : <EmptyState icon="book" title="No chapter structure is published" description="The subject exists, but this version does not yet contain verified chapter metadata."/>}
    </section>
  </div>;
}
