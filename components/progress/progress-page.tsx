import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { ProgressPageModel } from "@/lib/progress/types";
import { ProgressTracker } from "./progress-tracker";

export function ProgressPage({ model, subjectLocked = false, next = "/progress" }: { model: ProgressPageModel; subjectLocked?: boolean; next?: string }) {
  if (model.mode === "guest") return (
    <div className="progress-page">
      <PageHeader preview={false} eyebrow="Progress tracker" title="Track every chapter without losing history." description="Browse how chapter tracking works. Sign in only when you want to save your own completed, revision or test stages." />
      <Card><CardBody><div className="progress-empty"><Icon name="chart"/><h2>Read-only preview</h2><p>Guest mode can view the tracker, but progress changes are saved only to a signed-in account.</p></div></CardBody></Card>
      <LoginRequired next={next} title="Sign in to update your progress" />
    </div>
  );
  if (model.mode === "setup") return (
    <div className="progress-page">
      <PageHeader preview={false} eyebrow="Progress" title={`Finish your academic setup, ${model.viewerName}.`} description="Progress is stored against the chapters applicable to your level, group and verified attempt." />
      <Card><CardBody><div className="progress-setup"><Icon name="target" size={26}/><div><h2>Academic profile required</h2><p>Complete your level, group and attempt before creating private chapter progress rows.</p></div><Link className="ui-button ui-button--primary" href="/settings/profile">Review profile</Link></div></CardBody></Card>
    </div>
  );

  const subjectTitle = subjectLocked ? model.chapters[0]?.subjectTitle : null;
  return (
    <div className="progress-page">
      <PageHeader
        preview={false}
        eyebrow="Progress tracker"
        title={subjectTitle ? `${subjectTitle} progress` : "Track every chapter without losing history."}
        description={`${model.levelName} · ${model.groupLabel} · ${model.attemptKey}. Stage changes save automatically and analytics are calculated from your normalized chapter rows.`}
        actions={<Link className="dashboard-header-link" href="/analytics">View analytics</Link>}
      />
      {model.chapters.length ? <ProgressTracker model={model} subjectLocked={subjectLocked}/> : <Card><CardBody><div className="progress-empty"><Icon name="book"/><h2>No applicable chapters</h2><p>No chapter structure is currently mapped to this academic selection.</p><Link href="/settings/profile" className="ui-text-link">Review academic profile</Link></div></CardBody></Card>}
    </div>
  );
}
