import { AdminDenied } from "@/components/admin/admin-access";
import { ContentStateControl } from "@/components/admin/operations-controls";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getContentAdminModel, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

function ContentList({ title, description, rows, type }: { title:string; description:string; rows: unknown[]; type:"syllabus_version"|"exam_attempt"|"icai_resource" }) {
  return <Card><CardHeader title={title} description={description}/><CardBody>{rows.length ? <div className="phase12-content-list">{rows.map((raw) => { const row=raw as Record<string,unknown>; const id=String(row.id); return <article key={id}><div><strong>{String(row.title||row.label||id)}</strong><small>{id}</small>{row.source_url||row.official_url ? <a href={String(row.source_url||row.official_url)} target="_blank" rel="noreferrer">Official source ↗</a> : null}</div><div><span className="phase12-role-pill">{String(row.status)}</span>{row.verification_status ? <small>{String(row.verification_status)}</small> : null}</div><ContentStateControl entityType={type} entityId={id} status={String(row.status)} verificationStatus={row.verification_status?String(row.verification_status):undefined} canEdit={true}/></article>; })}</div> : <EmptyState icon="book" title={`No ${title.toLowerCase()}`} description="There is no data in this controlled registry yet."/>}</CardBody></Card>;
}

export default async function ContentAdminPage() {
  try { await requireAdminOperator("admin"); } catch { return <AdminDenied message="Admin, owner or parent-owner access is required for controlled academic content changes."/>; }
  const model=await getContentAdminModel();
  return <div className="phase12-page"><PageHeader preview={false} eyebrow="Operations · Content" title="Syllabus, attempts and ICAI resources" description="Controlled forms update existing normalized V2 domain objects. Status changes are validated server-side and written to the immutable operations audit log."/>
    <div className="phase12-stack"><ContentList title="Syllabus versions" description="Publish, supersede or stage normalized syllabus versions." rows={model.versions} type="syllabus_version"/><ContentList title="Exam attempts" description="Manage lifecycle and verification state without deleting historical attempts." rows={model.attempts} type="exam_attempt"/><ContentList title="ICAI resources" description="Manage resource lifecycle and verification while retaining official source provenance." rows={model.resources} type="icai_resource"/></div>
  </div>;
}
