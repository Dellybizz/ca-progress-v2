import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { StudyPageModel } from "@/lib/study/types";
import { StudyTimer } from "./study-timer";

function hours(seconds: number) {
  if (!seconds) return "0m";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const value = seconds / 3600;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}h`;
}

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
    return <div className="phase6-page study-page"><LoginRequired next="/study" title="Sign in to start and save study sessions"/></div>;
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
      <header className="study-page__intro">
        <div className="study-page__intro-copy">
          <span className="study-page__eyebrow"><Icon name="timer" size={15}/> Focus</span>
          <h1>{model.timer ? "Focus session" : "Study"}</h1>
          <p>{model.levelName} · {model.groupLabel} · {formatAttempt(model.attemptKey)}</p>
        </div>
        <div className="study-page__summary" aria-label="Study summary">
          <span><i><Icon name="clock" size={15}/></i><b>{hours(model.analytics.todaySeconds)}</b><small>Today</small></span>
          <span><i><Icon name="chart" size={15}/></i><b>{hours(model.analytics.last7DaysSeconds)}</b><small>Last 7 days</small></span>
          <span><i><Icon name="sparkles" size={15}/></i><b>{model.analytics.streakDays}</b><small>Day streak</small></span>
        </div>
      </header>

      <StudyTimer key={timerKey} model={model}/>
    </div>
  );
}
