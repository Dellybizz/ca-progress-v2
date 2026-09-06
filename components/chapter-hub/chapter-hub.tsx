import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import type { ChapterHubReadyModel } from "@/lib/chapter-hub/types";
import type { ProgressState } from "@/lib/progress/types";

const STAGES: Array<{ field: keyof ProgressState; label: string; short: string }> = [
  { field: "completed_at", label: "Completed", short: "Done" },
  { field: "revision_1_at", label: "Revision 1", short: "1R" },
  { field: "revision_2_at", label: "Revision 2", short: "2R" },
  { field: "test_1_at", label: "Test 1", short: "T1" },
  { field: "test_2_at", label: "Test 2", short: "T2" },
];

function dateLabel(value: string | null) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SectionTitle({ icon, eyebrow, title, action }: { icon: IconName; eyebrow: string; title: string; action?: React.ReactNode }) {
  return <header className="chapter-hub-section__header"><div className="chapter-hub-section__title"><span><Icon name={icon} size={18}/></span><div><small>{eyebrow}</small><h2>{title}</h2></div></div>{action}</header>;
}

export function ChapterHub({ model }: { model: ChapterHubReadyModel }) {
  const { academic } = model;
  const progressCount = STAGES.filter((stage) => Boolean(model.progress[stage.field])).length;
  const chapterQuery = `chapterId=${encodeURIComponent(academic.chapterId)}&subjectId=${encodeURIComponent(academic.subjectId)}`;
  const lastStudyAt = model.study.recentSessions[0]?.endedAt ?? null;

  return <div className="chapter-hub-page" data-canonical-chapter-id={academic.chapterId}>
    <nav className="chapter-hub-breadcrumb" aria-label="Chapter breadcrumb">
      <Link href="/progress">Progress</Link><Icon name="chevron" size={13}/>
      <Link href={`/subjects/${academic.subjectSlug}`}>{academic.subjectTitle}</Link><Icon name="chevron" size={13}/>
      <span>Chapter {academic.chapterNumber}</span>
    </nav>

    <section className="chapter-hub-hero">
      <div className="chapter-hub-hero__copy">
        <div className="chapter-hub-hero__badges"><Badge tone="brand">{academic.paperLabel}</Badge><Badge>{model.attemptKey}</Badge><Badge>{academic.groupName}</Badge></div>
        <span className="eyebrow">Chapter Hub · canonical workspace</span>
        <h1><b>{academic.chapterNumber}</b>{academic.chapterTitle}</h1>
        <p>Progress, study time, tests, notes, doubts, files and verified ICAI material stay connected to this chapter through its canonical academic ID.</p>
        <div className="chapter-hub-identity"><Icon name="lock" size={14}/><code>{academic.chapterId}</code><span>Stable chapter identity</span></div>
      </div>
      <div className="chapter-hub-hero__stats">
        <div><span>Progress</span><strong>{progressCount}/5</strong><small>stages complete</small></div>
        <div><span>Study time</span><strong>{durationLabel(model.study.totalSeconds)}</strong><small>{model.study.sessionCount} sessions</small></div>
        <div><span>Workspace</span><strong>{model.notes.length + model.files.length}</strong><small>notes + files</small></div>
      </div>
    </section>

    <section className="chapter-hub-context" aria-label="Academic scope">
      <div><small>Level</small><strong>{academic.levelName}</strong></div>
      <div><small>Subject</small><strong>{academic.subjectTitle}</strong></div>
      <div><small>Syllabus</small><strong>{academic.syllabusVersionKey}</strong></div>
      <div><small>Attempt</small><strong>{model.attemptKey}</strong></div>
    </section>

    <div className="chapter-hub-grid chapter-hub-grid--primary">
      <Card className="chapter-hub-section chapter-hub-progress"><CardBody>
        <SectionTitle icon="target" eyebrow="Progress" title="Chapter stages" action={<Link href={`/subjects/${academic.subjectSlug}/progress?chapterId=${encodeURIComponent(academic.chapterId)}`} className="chapter-hub-text-link">Open tracker <Icon name="arrow" size={13}/></Link>}/>
        <div className="chapter-hub-stage-grid">{STAGES.map((stage) => {
          const completedAt = model.progress[stage.field];
          return <div key={stage.field} className={completedAt ? "is-complete" : ""}><span>{completedAt ? <Icon name="check" size={14}/> : stage.short}</span><strong>{stage.label}</strong><small>{dateLabel(completedAt)}</small></div>;
        })}</div>
        {model.progressEvents.length ? <div className="chapter-hub-mini-history"><span>Recent changes</span>{model.progressEvents.slice(0, 3).map((event) => <div key={event.id}><strong>{event.stage.replaceAll("_", " ")}</strong><small>{event.action} · {dateLabel(event.createdAt)}</small></div>)}</div> : <p className="chapter-hub-empty-line">No progress events yet. The existing progress tracker remains the single mutation path.</p>}
      </CardBody></Card>

      <Card className="chapter-hub-section"><CardBody>
        <SectionTitle icon="timer" eyebrow="Study history" title="Time spent here" action={<Link href={`/study?${chapterQuery}`} className="chapter-hub-text-link">Start studying <Icon name="arrow" size={13}/></Link>}/>
        <div className="chapter-hub-study-total"><strong>{durationLabel(model.study.totalSeconds)}</strong><span>across {model.study.sessionCount} saved session{model.study.sessionCount === 1 ? "" : "s"}</span></div>
        <p className="chapter-hub-helper">Last studied: {dateLabel(lastStudyAt)}. Self-rated understanding will appear here once a study-session reflection has been recorded.</p>
        <div className="chapter-hub-list">{model.study.recentSessions.length ? model.study.recentSessions.slice(0, 4).map((session) => <div key={session.id}><span><Icon name="clock" size={14}/><strong>{durationLabel(session.durationSeconds)}</strong></span><small>{session.mode} · {dateLabel(session.endedAt)}</small></div>) : <p>No study sessions recorded for this chapter yet.</p>}</div>
      </CardBody></Card>
    </div>

    <div className="chapter-hub-grid">
      <Card className="chapter-hub-section"><CardBody>
        <SectionTitle icon="tests" eyebrow="Tests & results" title="Existing test milestones" action={<Link href={`/tests?${chapterQuery}`} className="chapter-hub-text-link">Tests <Icon name="arrow" size={13}/></Link>}/>
        <div className="chapter-hub-test-list">
          <div className={model.progress.test_1_at ? "is-complete" : ""}><span>{model.progress.test_1_at ? <Icon name="check" size={15}/> : "T1"}</span><div><strong>Test 1</strong><small>{model.progress.test_1_at ? `Completed ${dateLabel(model.progress.test_1_at)}` : "Not completed"}</small></div></div>
          <div className={model.progress.test_2_at ? "is-complete" : ""}><span>{model.progress.test_2_at ? <Icon name="check" size={15}/> : "T2"}</span><div><strong>Test 2</strong><small>{model.progress.test_2_at ? `Completed ${dateLabel(model.progress.test_2_at)}` : "Not completed"}</small></div></div>
        </div>
        <p className="chapter-hub-helper">This hub uses the current test checkpoints and links into the test workspace without creating a second source of test results.</p>
      </CardBody></Card>

      <Card className="chapter-hub-section"><CardBody>
        <SectionTitle icon="notes" eyebrow="Notes & saved answers" title="Your chapter notes" action={<Link href={`/notes?${chapterQuery}`} className="chapter-hub-text-link">All notes <Icon name="arrow" size={13}/></Link>}/>
        <div className="chapter-hub-content-list">{model.notes.length ? model.notes.map((note) => <Link key={note.id} href={`/notes/${note.id}`}><span><strong>{note.title}</strong><small>{note.excerpt || "No preview"}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No private notes are linked to this chapter yet.</p>}</div>
      </CardBody></Card>

      <Card className="chapter-hub-section"><CardBody>
        <SectionTitle icon="book" eyebrow="Your files" title="Chapter library" action={<Link href={`/resources?${chapterQuery}`} className="chapter-hub-text-link">Library <Icon name="arrow" size={13}/></Link>}/>
        <div className="chapter-hub-content-list">{model.files.length ? model.files.map((file) => <Link key={file.id} href={`/resources/${file.id}`}><span><strong>{file.title}</strong><small>{file.extension.toUpperCase()} · {fileSize(file.sizeBytes)} · {file.filename}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No private files are linked to this chapter yet.</p>}</div>
      </CardBody></Card>

      <Card className="chapter-hub-section"><CardBody>
        <SectionTitle icon="community" eyebrow="Doubts" title="Ask in the right academic room" action={<Link href="/community" className="chapter-hub-text-link">Community <Icon name="arrow" size={13}/></Link>}/>
        <div className="chapter-hub-content-list">{model.doubtChannels.length ? model.doubtChannels.map((channel) => <Link key={channel.id} href={`/community/${channel.channelKey}?chapterId=${encodeURIComponent(academic.chapterId)}`}><span><strong>{channel.title}</strong><small>{channel.description}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No subject-specific Doubts room is currently published for this chapter’s subject.</p>}</div>
      </CardBody></Card>
    </div>

    <Card className="chapter-hub-section chapter-hub-official"><CardBody>
      <SectionTitle icon="shield" eyebrow="Official ICAI resources" title="Verified material for this subject & attempt" action={<Link href={`/resources?${chapterQuery}`} className="chapter-hub-text-link">Browse all <Icon name="arrow" size={13}/></Link>}/>
      <p className="chapter-hub-helper">Cards use CA Progress canonical resource IDs. The open route resolves the latest verified ICAI location, so an upstream URL move does not change this card identity.</p>
      {model.officialResources.length ? <div className="chapter-hub-official-grid">{model.officialResources.map((resource) => <Link key={resource.canonicalResourceId} href={`/resources/${encodeURIComponent(resource.canonicalResourceId)}/open`} data-canonical-resource-id={resource.canonicalResourceId}>
        <span className="chapter-hub-resource-icon"><Icon name="book" size={18}/></span><span><Badge>{resource.resourceType.replaceAll("_", " ")}</Badge><strong>{resource.title}</strong><small>{resource.sourceName} · verified {dateLabel(resource.lastVerifiedAt)}</small></span><Icon name="arrow" size={15}/>
      </Link>)}</div> : <p className="chapter-hub-empty-line">No verified official resource is mapped to this subject and attempt yet.</p>}
    </CardBody></Card>

    <Card className="chapter-hub-section chapter-hub-topics"><CardBody>
      <SectionTitle icon="layers" eyebrow="Chapter structure" title="Topics & units"/>
      {model.topics.length ? <div className="chapter-hub-topic-grid">{model.topics.map((topic) => <span key={topic.id} data-academic-topic-id={topic.id}><b>{topic.unitNumber ?? "Unit"}</b>{topic.title}</span>)}</div> : <p className="chapter-hub-empty-line">No separately indexed topics are published for this chapter.</p>}
    </CardBody></Card>
  </div>;
}
