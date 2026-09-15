import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import { ChapterHub } from "@/components/chapter-hub/chapter-hub";
import { PageHeader } from "@/components/ui/page-header";
import { getChapterHubModel } from "@/lib/chapter-hub/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chapter Hub | CA Progress" };

export default async function ChapterHubPage({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  const model = await getChapterHubModel(chapterId);

  if (model.mode === "missing" || model.mode === "scope_mismatch") notFound();
  if (model.mode === "guest") {
    return <div className="chapter-hub-page"><LoginRequired next={`/chapters/${encodeURIComponent(chapterId)}`} title="Sign in to open this Chapter Hub"/></div>;
  }
  if (model.mode === "setup") {
    return <div className="chapter-hub-page"><PageHeader preview={false} eyebrow="Chapter Hub" title="Complete your academic profile first." description="Your level, group and attempt decide which canonical chapters belong in your workspace."/><Link href={`/settings/profile?next=${encodeURIComponent(`/chapters/${chapterId}`)}`} className="ui-button ui-button--primary">Review profile</Link></div>;
  }

  return <ChapterHub model={model}/>;
}
