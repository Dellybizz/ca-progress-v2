import { AdminDenied } from "@/components/admin/admin-access";
import { ContentStateControl } from "@/components/admin/operations-controls";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getContentAdminModel, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

function ContentList({ title, description, rows, type }: { title:string; description:string; rows: unknown[]; type:"syllabus_version"|"exam_attempt"|"icai_resource" }) {
  return <Card><CardHeader title={title} description={description}/><CardBody>{rows.length ? <div className="phase12-content-list">{rows.map((raw) => { const row=raw as Record<string,unknown>; const id=String(row.id); return <article key={id}><div><strong>{String(row.title||row.label||id)}</strong><small>{id}</small>{row.source_url||row.official_url ? <a href={String(row.source_url||row.official_url)} target="_blank" rel="noreferrer">Official source ↗</a> : null}</div><div><span className="phase12-role-pill">{String(row.status)}</span>{row.verification_status ? <small>{String(row.verification_status)}</small> : null}</div><ContentStateControl entityType={type} entityId={id} status={String(row.status)} verificationStatus={row.verification_status?String(row.verification_status):undefined} canEdit={true}/></article>; })}</div> : <EmptyState icon="book" title={`No ${title.toLowerCase()}`} description="No data in this registry."/>}</CardBody></Card>;
}

export default async function ContentAdminPage() {
  try { await requireAdminOperator("admin"); } catch { return <AdminDenied message="Admin access is required for academic content."/>; }
  const model=await getContentAdminModel();
  return <div className="phase12-page"><PageHeader preview={false} eyebrow="Operations · Content" title="Syllabus, attempts and ICAI resources" description="Server-validated state changes with immutable auditing."/>
    <div className="phase12-stack"><ContentList title="Syllabus versions" description="Version lifecycle." rows={model.versions} type="syllabus_version"/><ContentList title="Exam attempts" description="Lifecycle and verification." rows={model.attempts} type="exam_attempt"/><ContentList title="ICAI resources" description="Lifecycle and provenance." rows={model.resources} type="icai_resource"/></div>
  </div>;
}
