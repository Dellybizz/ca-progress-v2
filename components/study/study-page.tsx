import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { StudyPageModel } from "@/lib/study/types";
import { StudyTimer } from "./study-timer";

function hours(seconds: number) { return seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`; }

const studySignals = [
  { icon: "clock" as const, label: "Today", hint: "focused time" },
  { icon: "chart" as const, label: "This week", hint: "last 7 days" },
  { icon: "sparkles" as const, label: "Streak", hint: "study days" },
  { icon: "timer" as const, label: "Sessions", hint: "last 7 days" },
];

export function StudyPage({ model }: { model: StudyPageModel }) {
  if (model.mode === "guest") return <div className="phase6-page study-page"><LoginRequired next="/study" title="Sign in to use your study timer"/></div>;
  if (model.mode === "setup") return <div className="phase6-page study-page"><PageHeader preview={false} eyebrow="Study" title={`Set up Study, ${model.viewerName}.`} description="Choose your level, group and attempt first so sessions can be linked to the right subjects."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;

  const timerKey = model.timer ? `${model.timer.startedAt}:${model.timer.status}:${model.timer.elapsedSeconds}:${model.timer.lastInteractionAt}` : "idle";
  const values = [
    hours(model.analytics.todaySeconds),
    hours(model.analytics.last7DaysSeconds),
    `${model.analytics.streakDays}`,
    `${model.analytics.sessionCountLast7Days}`,
  ];

  return <div className="phase6-page study-page">
    <PageHeader
      preview={false}
      eyebrow="Study"
      title="Start a focused study session."
      description={`${model.levelName} · ${model.groupLabel} · ${model.attemptKey}`}
      actions={<div className="phase6-header-links study-header-links"><Link href="/activity">Activity</Link><Link href="/analytics">Analytics</Link></div>}
    />

    <section className="phase6-metric-strip study-signal-strip" aria-label="Study summary">
      {studySignals.map((signal, index) => (
        <Card key={signal.label}>
          <CardBody>
            <span className="study-signal-icon"><Icon name={signal.icon}/></span>
            <span className="study-signal-copy">
              <small>{signal.label}</small>
              <strong>{values[index]}</strong>
              <em>{signal.hint}</em>
            </span>
          </CardBody>
        </Card>
      ))}
    </section>

    <StudyTimer key={timerKey} model={model}/>
  </div>;
}
