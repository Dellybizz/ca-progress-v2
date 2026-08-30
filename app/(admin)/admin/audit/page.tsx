import Link from "next/link";
import { AdminDenied } from "@/components/admin/admin-access";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAuditLog, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{page?:string;action?:string;actor?:string}> }) {
  try { await requireAdminOperator("admin"); } catch { return <AdminDenied message="Admin, owner or parent-owner access is required to inspect privileged audit history."/>; }
  const query=await searchParams; const page=Math.max(1,Number(query.page||"1")||1); const rows=await getAuditLog({page,limit:50,action:query.action,actor:query.actor});
  return <div className="phase12-page"><PageHeader preview={false} eyebrow="Operations · Audit" title="Immutable audit log" description="Every Phase 12 privileged mutation records actor, before/after state and request identity. Database triggers reject update or delete attempts against this log."/>
    <form className="phase12-filterbar" method="get"><input name="action" defaultValue={query.action||""} placeholder="Filter action key"/><input name="actor" defaultValue={query.actor||""} placeholder="Actor user UUID"/><button type="submit">Filter</button><Link href="/admin/audit">Reset</Link></form>
    {rows.length ? <div className="phase12-audit-list">{rows.map((raw) => { const row=raw as Record<string,unknown>; return <article key={String(row.id)}><div className="phase12-audit-head"><div><strong>{String(row.action_key)}</strong><span>{String(row.entity_type)}{row.entity_id?` · ${String(row.entity_id)}`:""}</span></div><time>{new Date(String(row.created_at)).toLocaleString("en-IN")}</time></div><div className="phase12-audit-meta"><span>Actor: {String(row.actor_role)} · {String(row.actor_user_id||"system")}</span><code>{String(row.request_id)}</code></div><details><summary>Before / after state</summary><pre>{JSON.stringify({before:row.before_state,after:row.after_state,metadata:row.metadata},null,2)}</pre></details></article>; })}</div> : <EmptyState icon="notes" title="No audit records match" description="Privileged Phase 12 changes will appear here and cannot be edited or deleted."/>}
    <nav className="phase12-pagination"><Link aria-disabled={page<=1} href={`/admin/audit?page=${Math.max(1,page-1)}`}>Previous</Link><span>Page {page}</span><Link aria-disabled={rows.length<50} href={`/admin/audit?page=${page+1}`}>Next</Link></nav>
  </div>;
}
