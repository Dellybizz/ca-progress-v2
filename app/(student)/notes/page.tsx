import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { PageHeader } from "@/components/ui/page-header";
import { getCommunityNoteDraftForViewer } from "@/lib/notes/phase6";
import { getResourceLibraryModel } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notes | CA Progress" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ subjectId?: string; chapterId?: string; communityMessageId?: string }> }) {
  const { subjectId, chapterId, communityMessageId } = await searchParams;
  const [model, communityDraft] = await Promise.all([
    getResourceLibraryModel(),
    getCommunityNoteDraftForViewer(communityMessageId),
  ]);
  if (model.mode === "guest") return <div className="phase7-page"><PageHeader preview eyebrow="Notes preview" title="Revision Notes" description="Your private CA revision workspace appears after you sign in."/><div className="phase7-guest-official"><p>Official ICAI resources remain available separately.</p><Link className="ui-text-link" href="/resources/icai">Browse verified ICAI resources →</Link></div><LoginRequired next={communityMessageId ? `/notes?communityMessageId=${encodeURIComponent(communityMessageId)}` : "/notes"} title="Sign in to open your private notes workspace"/></div>;
  if (model.mode !== "ready") return null;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow="CA revision workspace" title={`Revision Notes, ${model.viewerName}.`} description="Link notes to subjects, chapters and optional Unit/AS; use focused formatting and tables; keep files private; or retain a useful Community answer with its source."/><ResourceLibrary model={model} initialTab="my" initialAcademicContext={{ subjectId, chapterId }} initialCommunityDraft={communityDraft}/></div>;
}
