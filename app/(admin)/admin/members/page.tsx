import Link from "next/link";
import { AdminDenied } from "@/components/admin/admin-access";
import { MemberRoleControl } from "@/components/admin/operations-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { canManageRoles, listMembers, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; role?: string }> }) {
  let operator;
  try { operator = await requireAdminOperator("admin"); }
  catch { return <AdminDenied message="Admin access is required for members."/>; }
  const query = await searchParams;
  const page = Math.max(1, Number(query.page || "1") || 1);
  const model = await listMembers(operator, { page, limit: 25, search: query.q, role: query.role });
  const pages = Math.max(1, Math.ceil(model.total/model.limit));
  const canManage = canManageRoles(operator.role);
  return <div className="phase12-page">
    <PageHeader preview={false} eyebrow="Operations · Members" title="Members and access" description="Paginated members, plans and privileged roles."/>
    <form className="phase12-filterbar" method="get"><input name="q" defaultValue={query.q || ""} placeholder="Search name or email"/><select name="role" defaultValue={query.role || ""}><option value="">All roles</option><option value="student">Students</option><option value="moderator">Moderators</option><option value="admin">Admins</option><option value="owner">Owners</option><option value="parent_owner">Parent owner</option></select><button type="submit">Filter</button><Link href="/admin/members">Reset</Link></form>
    {model.rows.length ? <div className="phase12-table-wrap"><table className="phase12-table"><thead><tr><th>Member</th><th>Access</th><th>Current plan</th><th>Joined</th><th>Operations</th></tr></thead><tbody>{model.rows.map((row) => <tr key={row.user_id}><td><strong>{row.display_name || "Member"}</strong><small>{row.email || row.user_id}</small></td><td><span className="phase12-role-pill">{row.role.replace("_"," ")}</span>{row.role !== "student" ? <small>{row.admin_active ? "Active" : "Disabled"}</small> : null}</td><td><strong>{row.plan_name}</strong><small>{row.subscription_ends_at ? `Until ${new Date(row.subscription_ends_at).toLocaleDateString("en-IN")}` : row.plan_tier === "free" ? "Free" : "No expiry"}</small></td><td>{new Date(row.user_created_at).toLocaleDateString("en-IN")}</td><td>{canManage && row.user_id !== operator.userId ? <MemberRoleControl userId={row.user_id} currentRole={row.role} active={row.admin_active} operatorRole={operator.role}/> : <span className="phase12-muted">{row.user_id === operator.userId ? "Your account" : "View only"}</span>}</td></tr>)}</tbody></table></div> : <EmptyState icon="community" title="No members match" description="Clear filters or try another search."/>}
    <nav className="phase12-pagination" aria-label="Member pagination"><Link aria-disabled={page<=1} href={`/admin/members?page=${Math.max(1,page-1)}${query.q?`&q=${encodeURIComponent(query.q)}`:""}${query.role?`&role=${encodeURIComponent(query.role)}`:""}`}>Previous</Link><span>Page {page} of {pages} · {model.total.toLocaleString("en-IN")} members</span><Link aria-disabled={page>=pages} href={`/admin/members?page=${Math.min(pages,page+1)}${query.q?`&q=${encodeURIComponent(query.q)}`:""}${query.role?`&role=${encodeURIComponent(query.role)}`:""}`}>Next</Link></nav>
  </div>;
}
