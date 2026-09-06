import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { TestProgressWorkspace } from "@/components/tests/test-progress-workspace";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { optionalUser } from "@/lib/auth/server";
import { getProgressPageModel } from "@/lib/progress/service";
import { getPhase4TestStageRecords } from "@/lib/tests/phase4";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tests | CA Progress" };

export default async function TestsPage() {
  const model = await getProgressPageModel();
  if (model.mode === "guest") return <div className="progress-page">
    <PageHeader preview={false} eyebrow="Tests" title="Record test marks once." description="Test 1 and Test 2 marks connect directly to chapter progress after sign-in." actions={<Link href="/progress">Progress</Link>}/>
    <Card><CardBody><div className="progress-empty"><Icon name="target"/><h2>Private test records</h2><p>Sign in to save marks against your applicable chapters.</p></div></CardBody></Card>
    <LoginRequired next="/tests" title="Sign in to record test marks"/>
  </div>;

  if (model.mode === "setup") return <div className="progress-page">
    <PageHeader preview={false} eyebrow="Tests" title="Complete your academic profile first." description="Tests are scoped to the chapters applicable to your selected level, group and attempt."/>
    <Link className="ui-button ui-button--primary" href="/settings/profile">Review profile</Link>
  </div>;

  const identity = await optionalUser();
  if (!identity) return <LoginRequired next="/tests" title="Sign in to record test marks"/>;
  const records = await getPhase4TestStageRecords(identity.id, model.chapters.map((chapter) => chapter.id));

  return <div className="progress-page">
    <PageHeader
      preview={false}
      eyebrow="Tests"
      title="Test marks and progress stay in sync."
      description={`${model.levelName} · ${model.groupLabel} · ${model.attemptKey}. Saving a valid Test 1 or Test 2 milestone updates chapter progress automatically; no second checkbox is required.`}
      actions={<div className="phase6-header-links"><Link href="/progress">Progress</Link><Link href="/analytics">Analytics</Link></div>}
    />
    <TestProgressWorkspace initialChapters={model.chapters} initialRecords={records}/>
  </div>;
}
