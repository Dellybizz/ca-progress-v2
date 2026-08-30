import { AdminDenied } from "@/components/admin/admin-access";
import { NotificationTemplateComposer } from "@/components/admin/operations-controls";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getNotificationTemplates, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export default async function NotificationsAdminPage() {
  let operator;
  try { operator=await requireAdminOperator("admin"); }
  catch { return <AdminDenied message="Admin, owner or parent-owner access is required for notification templates."/>; }
  const templates=await getNotificationTemplates();
  return <div className="phase12-page"><PageHeader preview={false} eyebrow="Operations · Notifications" title="Notification composer and templates" description="Create reusable, auditable copy templates. Phase 12 stores templates only; no delivery is implied until a delivery workflow explicitly consumes one."/>
    <section className="phase12-two-col"><Card><CardHeader title="Create template" description="Saved through the protected admin API"/><CardBody><NotificationTemplateComposer canEdit={true}/></CardBody></Card><Card><CardHeader title="Template library" description={`${templates.length} saved template${templates.length===1?"":"s"}`}/><CardBody>{templates.length ? <div className="phase12-template-list">{templates.map((raw) => { const item=raw as Record<string,unknown>; return <article key={String(item.id)}><div><strong>{String(item.name)}</strong><code>{String(item.template_key)}</code></div><h3>{String(item.title)}</h3><p>{String(item.body)}</p><small>{item.is_active ? "Active" : "Inactive"} · updated {new Date(String(item.updated_at)).toLocaleString("en-IN")}</small></article>; })}</div> : <EmptyState icon="bell" title="No notification templates" description="Create the first reusable operations template from the composer."/>}</CardBody></Card></section>
  </div>;
}
