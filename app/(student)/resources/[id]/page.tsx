import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import { ResourceAccessButtons } from "@/components/resources/resource-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getResourceDetailModel } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resource | CA Progress" };

function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`; }

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await getResourceDetailModel(id);
  if (model.mode === "guest") return <div className="phase7-page"><LoginRequired next={`/resources/${id}`} title="Sign in to access this resource"/></div>;
  if (model.mode === "missing") notFound();
  const { resource } = model;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow={model.canManage ? "My Resource" : "Community · Approved"} title={resource.title} description={`${resource.extension.toUpperCase()} · ${formatBytes(resource.sizeBytes)} · ${resource.chapterTitle ?? resource.subjectTitle ?? "General resource"}`}/><Card className={model.canManage ? "phase7-resource-detail" : "phase7-community-detail"}><CardHeader title="Resource metadata" description={model.canManage ? "The file bytes stay in private Cloudflare R2 storage. Access is issued only through a short-lived signed URL." : `Shared by ${resource.ownerLabel} after moderation.`} action={<Badge tone={resource.moderationStatus === "approved" ? "success" : resource.moderationStatus === "pending" ? "warning" : resource.moderationStatus === "rejected" || resource.moderationStatus === "reported" ? "danger" : "neutral"}>{model.canManage ? resource.moderationStatus : "Community · Approved"}</Badge>}/><CardBody><dl className="phase7-resource-meta"><div><dt>File</dt><dd>{resource.originalFilename}</dd></div><div><dt>Type</dt><dd>{resource.mimeType}</dd></div><div><dt>Size</dt><dd>{formatBytes(resource.sizeBytes)}</dd></div><div><dt>Owner</dt><dd>{resource.ownerLabel}</dd></div><div><dt>Subject</dt><dd>{resource.subjectTitle ?? "—"}</dd></div><div><dt>Chapter</dt><dd>{resource.chapterTitle ?? "—"}</dd></div></dl>{resource.description ? <div className="phase7-resource-description"><h3>Description</h3><p>{resource.description}</p></div> : null}<ResourceAccessButtons resource={resource} canManage={model.canManage} canReport={model.canReport}/></CardBody></Card></div>;
}
