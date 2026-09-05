import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { StudyPageModel } from "@/lib/study/types";
import { StudyTimer } from "./study-timer";

function formatAttempt(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return value;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function StudyPage({ model }: { model: StudyPageModel }) {
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
    <div className="phase6-page study-page">
      <header className="study-page__intro study-page__intro--simple">
        <div className="study-page__intro-copy">
          <span className="study-page__eyebrow"><Icon name="timer" size={15}/> Focus</span>
          <h1>{model.timer ? "Focus session" : "Study"}</h1>
          <p>{model.levelName} · {model.groupLabel} · {formatAttempt(model.attemptKey)}</p>
        </div>
      </header>

      <StudyTimer key={timerKey} model={model}/>
    </div>
  );
}
