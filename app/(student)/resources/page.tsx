import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getResourceLibraryModel } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resources | CA Progress" };

export default async function ResourcesPage() {
  const model = await getResourceLibraryModel();
  if (model.mode === "ready") return <div className="phase7-page"><PageHeader preview={false} eyebrow="Phase 7 · Resource library" title="My, Community and ICAI resources in one library." description="Private files use signed access; Community items are moderated; official ICAI metadata stays visibly separate from user uploads."/><ResourceLibrary model={model} initialTab="my"/></div>;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow="Resource library" title="Verified ICAI resources remain available without a private workspace." description="Sign in to create notes, upload private files and access approved Community resources."/><LoginRequired next="/resources" title="Sign in for My Notes & Files"/><Card className="phase7-icai-card"><CardHeader title="ICAI official resources" description="Verified official-source metadata from the Phase 8 engine." action={<Badge tone="success">Official · Verified</Badge>}/><CardBody>{model.officialResources.length ? <div className="phase7-document-list">{model.officialResources.slice(0, 20).map((resource) => <a href={resource.officialUrl} target="_blank" rel="noreferrer" className="phase7-document-card phase7-document-card--icai" key={resource.id}><div className="phase7-document-icon"><Icon name="shield"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{resource.title}</strong><Badge tone="success">ICAI Official</Badge></div><p>{resource.summary || resource.resourceType.replaceAll("_", " ")}</p><div className="phase7-document-meta"><span>{resource.sourceName}</span><span>Verified {new Date(resource.lastVerifiedAt).toLocaleDateString()}</span></div></div><Icon name="arrow" size={17}/></a>)}</div> : <EmptyState icon="shield" title="No verified ICAI resources yet" description="The official-source feed is currently empty."/>}<Link href="/resources/icai" className="ui-text-link">Open ICAI resource browser →</Link></CardBody></Card></div>;
}
