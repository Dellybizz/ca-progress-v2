import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { StudyPageModel } from "@/lib/study/types";
import { StudyTimer } from "./study-timer";

function hours(seconds: number) { return seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`; }

export function StudyPage({ model }: { model: StudyPageModel }) {
  if (model.mode === "guest") return <div className="phase6-page"><LoginRequired next="/study" title="Sign in to use your persistent study timer"/></div>;
  if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Study" title={`Complete your academic setup, ${model.viewerName}.`} description="Subject and chapter-linked study sessions need your current level, group and attempt."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  const timerKey = model.timer ? `${model.timer.startedAt}:${model.timer.status}:${model.timer.elapsedSeconds}:${model.timer.lastInteractionAt}` : "idle";
  return <div className="phase6-page"><PageHeader preview={false} eyebrow="Study" title="Focus now. Let the session become your analytics." description={`${model.levelName} · ${model.groupLabel} · ${model.attemptKey}. Timer state persists server-side across reloads.`} actions={<div className="phase6-header-links"><Link href="/activity">Activity</Link><Link href="/analytics">Analytics</Link></div>}/><section className="phase6-metric-strip"><Card><CardBody><Icon name="clock"/><span><strong>{hours(model.analytics.todaySeconds)}</strong><small>studied today</small></span></CardBody></Card><Card><CardBody><Icon name="chart"/><span><strong>{hours(model.analytics.last7DaysSeconds)}</strong><small>last 7 days</small></span></CardBody></Card><Card><CardBody><Icon name="sparkles"/><span><strong>{model.analytics.streakDays}</strong><small>day streak</small></span></CardBody></Card><Card><CardBody><Icon name="timer"/><span><strong>{model.analytics.sessionCountLast7Days}</strong><small>sessions / 7 days</small></span></CardBody></Card></section><StudyTimer key={timerKey} model={model}/></div>;
}
