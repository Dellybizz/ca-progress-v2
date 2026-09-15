import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminUserById } from "@/lib/admin/phase1";
import { getUserSubscriptionAccess } from "@/lib/admin/subscription-access";
import { requireAdminPageCapability } from "@/lib/authorization/server";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"User detail | CA Progress Admin"};
const when=(value:string|null)=>value?new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"—";

export default async function AdminUserDetailPage({params}:{params:Promise<{userId:string}>}){
  await requireAdminPageCapability("users.read");
  const {userId}=await params;
  const user=await getAdminUserById(decodeURIComponent(userId));
  if(!user)notFound();
  const access=await getUserSubscriptionAccess(user.userId);
  return <main className="admin-page">
    <PageHeader preview={false} eyebrow="Users" title={user.displayName??"Unnamed user"} description="A privacy-scoped account overview. Study notes, files, test answers and identity-provider subjects are intentionally excluded."/>
    <div className="admin-user-actions"><Link className="ui-button ui-button--ghost" href="/admin/users">← All users</Link><Link className="ui-button ui-button--primary" href={`/admin/users/${encodeURIComponent(user.userId)}/subscription-access`}>Subscription access</Link></div>
    <section className="admin-detail-grid" aria-label="User identity and academic profile">
      <article className="ui-card admin-detail-card"><h2>Identity</h2><dl><dt>Email</dt><dd>{user.email??"No current email"}</dd><dt>Application user ID</dt><dd><code>{user.userId}</code></dd><dt>Role</dt><dd>{user.role.replaceAll("_"," ")}</dd><dt>Account state</dt><dd>{user.accountState}</dd><dt>Last seen</dt><dd>{when(user.lastSeenAt)}</dd><dt>Created</dt><dd>{when(user.createdAt)}</dd></dl></article>
      <article className="ui-card admin-detail-card"><h2>Academic profile</h2><dl><dt>CA level</dt><dd>{user.caLevel??"—"}</dd><dt>Group choice</dt><dd>{user.groupChoice??"—"}</dd><dt>Attempt</dt><dd>{user.attemptKey??"—"}</dd></dl></article>
      <article className="ui-card admin-detail-card"><h2>Effective access</h2><p className="admin-access-source"><strong>{access.effective.planName??access.effective.label}</strong><span>{access.effective.label}</span></p><p>{access.effective.detail}</p><p><Link href={`/admin/users/${encodeURIComponent(user.userId)}/subscription-access`}>View all access sources and history →</Link></p></article>
      <article className="ui-card admin-detail-card"><h2>Billing summary</h2><dl><dt>Subscription records</dt><dd>{access.subscriptions.length}</dd><dt>Payment orders</dt><dd>{access.payments.length}</dd><dt>Manual grants</dt><dd>{access.grants.length}</dd><dt>Promotions / rewards</dt><dd>{access.promotions.length+access.rewards.length}</dd></dl></article>
    </section>
  </main>;
}
