import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { TestArchiveWorkspace } from "@/components/tests/test-archive-workspace";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { optionalUser } from "@/lib/auth/server";
import { getProgressPageModel } from "@/lib/progress/service";
import { getPhase4TestStageRecords } from "@/lib/tests/phase4";
import { getPhase5TestArchive } from "@/lib/tests/phase5";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tests | CA Progress" };

export default async function TestsPage() {
  const model = await getProgressPageModel();
  if (model.mode === "guest") return <div className="progress-page">
    <PageHeader preview={false} eyebrow="Tests" title="Your private test archive." description="Keep every attempt, improvement trend, test file and mistake pattern together after sign-in." actions={<Link href="/progress">Progress</Link>}/>
    <Card><CardBody><div className="progress-empty"><Icon name="target"/><h2>Private test history</h2><p>Sign in to save immutable attempts and private test files against your applicable chapters.</p></div></CardBody></Card>
    <LoginRequired next="/tests" title="Sign in to use your test archive"/>
  </div>;

  if (model.mode === "setup") return <div className="progress-page">
    <PageHeader preview={false} eyebrow="Tests" title="Complete your academic profile first." description="Tests are scoped to the chapters applicable to your selected level, group and attempt."/>
    <Link className="ui-button ui-button--primary" href="/settings/profile">Review profile</Link>
  </div>;

  const identity = await optionalUser();
  if (!identity) return <LoginRequired next="/tests" title="Sign in to use your test archive"/>;
  const chapterIds = model.chapters.map((chapter) => chapter.id);
  const [milestoneRecords, archive] = await Promise.all([
    getPhase4TestStageRecords(identity.id, chapterIds),
    getPhase5TestArchive(identity.id, chapterIds),
  ]);

  return <div className="progress-page">
    <PageHeader
      preview={false}
      eyebrow="Tests"
      title="Every test attempt becomes useful history."
      description={`${model.levelName} · ${model.groupLabel} · ${model.attemptKey}. The first valid Test 1/Test 2 completion advances chapter progress once; retakes append Attempt 2, 3 and beyond without overwriting earlier results.`}
      actions={<div className="phase6-header-links"><Link href="/progress">Progress</Link><Link href="/analytics">Analytics</Link></div>}
    />
    <TestArchiveWorkspace initialChapters={model.chapters} milestoneRecords={milestoneRecords} initialArchive={archive}/>
  </div>;
}
