import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { PageHeader } from "@/components/ui/page-header";
import { getResourceLibraryModel } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notes | CA Progress" };

export default async function NotesPage() {
  const model = await getResourceLibraryModel();
  if (model.mode === "guest") return <div className="phase7-page"><LoginRequired next="/notes" title="Sign in to open your private notes workspace"/><div className="phase7-guest-official"><p>Official ICAI resources remain available separately.</p><Link className="ui-text-link" href="/resources/icai">Browse verified ICAI resources →</Link></div></div>;
  if (model.mode !== "ready") return null;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow="Phase 7 · Personal library" title={`Your notes and resources, ${model.viewerName}.`} description="Write rich-text notes, keep files private by default, or submit selected resources to the moderated Community library."/><ResourceLibrary model={model} initialTab="my"/></div>;
}
