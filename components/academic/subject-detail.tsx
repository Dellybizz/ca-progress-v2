import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { AcademicSubject } from "@/lib/academic/types";

function sectionLabel(value: string) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function SubjectDetail({ subject }: { subject: AcademicSubject }) {
  return <div className="academic-page academic-subject-page" id="top">
    <Link href="/syllabus" className="academic-back-link"><Icon name="arrow" size={15}/>Back to syllabus explorer</Link>
    <section className="academic-subject-hero">
      <div>
        <div className="academic-subject-hero__badges"><Badge tone="brand">{subject.paperLabel}</Badge><Badge tone={subject.version.status === "published" ? "success" : "neutral"}>{subject.version.status}</Badge></div>
        <h1>{subject.title}</h1>
        <p>{subject.version.title}. Chapter IDs are stable and ready to become the progress keys in the later progress phase.</p>
      </div>
      <Card className="academic-version-card"><CardBody><span className="eyebrow">Syllabus version</span><strong>{subject.version.key}</strong><small>Effective from {new Date(`${subject.version.effectiveFrom}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small><a href={subject.version.sourceUrl} target="_blank" rel="noreferrer">Official ICAI source <Icon name="arrow" size={14}/></a></CardBody></Card>
    </section>

    <section className="academic-progress-readiness"><Icon name="layers" size={19}/><div><strong>Progress-ready structure</strong><p>This phase defines the immutable academic IDs only. Completion, revisions and test stages are intentionally not written here.</p></div><Badge tone="info">Read-only</Badge></section>

    <section className="academic-chapter-list-section">
      <div className="academic-section-heading"><div><span className="eyebrow">Academic structure</span><h2>{subject.kind === "case_study" ? "Integrated units" : "Chapters & units"}</h2></div><Badge>{subject.chapters.length} rows</Badge></div>
      {subject.chapters.length ? <div className="academic-chapter-rows">{subject.chapters.map((chapter) => <article key={chapter.id} id={chapter.id} className="academic-chapter-row" data-academic-chapter-id={chapter.id}>
        <div className="academic-chapter-row__number"><span>{chapter.number}</span></div>
        <div className="academic-chapter-row__content"><div className="academic-chapter-row__heading"><div><h3>{chapter.title}</h3>{chapter.sectionKey ? <small>{sectionLabel(chapter.sectionKey)}</small> : null}</div><Badge tone={chapter.kind === "special_unit" ? "warning" : "neutral"}>{chapter.kind === "special_unit" ? "Special unit" : "Chapter"}</Badge></div>
        {chapter.topics.length ? <div className="academic-topic-chips">{chapter.topics.map((topic) => <span key={topic.id} data-academic-topic-id={topic.id}><b>{topic.unitNumber ?? "Unit"}</b>{topic.title}{topic.kind === "accounting_standard" ? <i>AS</i> : null}</span>)}</div> : <p className="academic-chapter-row__empty">No separately indexed units for this chapter.</p>}</div>
        <div className="academic-chapter-row__future"><span>Progress</span><strong>Not tracked yet</strong><small>Phase 5</small></div>
      </article>)}</div> : <EmptyState icon="book" title="No chapter structure is published" description="The subject exists, but this version does not yet contain verified chapter metadata."/>}
    </section>
  </div>;
}
