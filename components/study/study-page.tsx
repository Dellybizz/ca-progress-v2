import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { StudyPageModel } from "@/lib/study/types";
import { StudyReflection } from "./study-reflection";
import { StudyTimer } from "./study-timer";

function formatAttempt(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return value;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function StudyPage({ model, initialSubjectId = null, initialChapterId = null, initialTaskId = null }: { model: StudyPageModel; initialSubjectId?: string | null; initialChapterId?: string | null; initialTaskId?: string | null }) {
  if (model.mode === "guest") {
    return (
      <div className="phase6-page study-page">
        <PageHeader preview={false} eyebrow="Study" title="Focus without losing your rhythm." description="Explore Study mode as a guest. Sign in when you want to start a timer and save sessions to your account." />
        <LoginRequired next="/study" title="Sign in to start and save study sessions"/>
      </div>
    );
  }

  if (model.mode === "setup") {
    return (
      <div className="phase6-page study-page">
        <PageHeader
          preview={false}
          eyebrow="Study"
          title={`Set up your study space, ${model.viewerName}.`}
          description="Choose your CA level, group and attempt first so sessions can be linked to the right subjects."
        />
        <Link href="/settings/profile" className="ui-button ui-button--primary">Complete study setup</Link>
      </div>
    );
  }

  const timerKey = model.timer ? `${model.timer.startedAt}:${model.timer.status}:${model.timer.elapsedSeconds}:${model.timer.lastInteractionAt}` : "idle";

  return (
    <div className="phase6-page study-page academic-index-study">
      <header className="study-page__intro study-page__intro--simple">
        <div className="study-page__intro-copy">
          <span className="study-page__eyebrow"><Icon name="timer" size={15}/> Study workspace</span>
          <h1>{model.timer ? "Focus session" : "Study"}</h1>
          <p>{model.levelName} · {model.groupLabel} · {formatAttempt(model.attemptKey)}</p>
        </div>
        <Link href="/syllabus" className="academic-index-link">Browse course structure <Icon name="arrow" size={14}/></Link>
      </header>

      {!model.timer ? <section className="study-course-index" aria-label="Your academic index">
        <header><div><span className="study-page__eyebrow">Continue quickly</span><h2>Choose where to focus</h2></div><small>{model.subjects.length} subjects in your group</small></header>
        <div className="study-course-index__subjects">
          {model.subjects.slice(0, 4).map((subject, index) => {
            const recent = model.analytics.recentSessions.find((session) => session.subjectId === subject.id);
            const chapter = recent?.chapterId ? subject.chapters.find((item) => item.id === recent.chapterId) : subject.chapters[0];
            const href = chapter ? `/study?subjectId=${encodeURIComponent(subject.id)}&chapterId=${encodeURIComponent(chapter.id)}#study-timer` : `/subjects/${subject.slug}`;
            return <Link key={subject.id} href={href} className="study-course-index__row">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{subject.title}</strong><small>{recent ? `Resume ${recent.chapterTitle ?? "recent work"}` : chapter ? `${subject.chapters.length} chapters · Start with ${chapter.title}` : "Open subject workspace"}</small></div>
              <span className="study-course-index__action">{recent ? "Resume" : "Start"}<Icon name="arrow" size={13}/></span>
            </Link>;
          })}
        </div>
        {model.subjects.length > 4 ? <Link href="/syllabus" className="study-course-index__all">View all {model.subjects.length} subjects</Link> : null}
      </section> : null}

      {model.pendingReflection ? <StudyReflection session={model.pendingReflection}/> : null}
      <div id="study-timer"><StudyTimer key={timerKey} model={model} initialSubjectId={initialSubjectId ?? undefined} initialChapterId={initialChapterId ?? undefined} initialTaskId={initialTaskId ?? undefined}/></div>
    </div>
  );
}
