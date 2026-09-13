import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { searchAdminUsers } from "@/lib/admin/phase1";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Users | CA Progress Admin" };

function param(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function when(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPageCapability("users.read");
  const params = await searchParams;
  const query = param(params.q) ?? "";
  const requestedPage = Number(param(params.page) ?? "1");
  const result = await searchAdminUsers({ query, page: requestedPage });
  const pageHref = (page: number) => `/admin/users?${new URLSearchParams({ ...(result.query ? { q: result.query } : {}), page: String(page) }).toString()}`;

  return <main className="admin-page">
    <PageHeader preview={false} eyebrow="People" title="Users" description="Search by name, email or stable application user ID. Private notes, files and test contents are not exposed here."/>

    <form method="get" className="admin-page__filters">
      <Input name="q" defaultValue={result.query} placeholder="Name, email or user ID" label="Search users"/>
      <Button type="submit" variant="secondary">Search</Button>
      {result.query ? <Link href="/admin/users" className="ui-button ui-button--ghost">Clear</Link> : null}
    </form>

    <div className="admin-page__summary" role="status">{result.total.toLocaleString("en-IN")} matching users · page {result.page} of {result.totalPages}</div>
    <div className="data-view">
      <table className="data-table">
        <thead><tr>
          {['User','Role / state','CA profile','Plan','Last seen','Created'].map((label) => <th key={label}>{label}</th>)}
        </tr></thead>
        <tbody>{result.users.length ? result.users.map((user) => <tr key={user.userId}>
          <td data-label="User"><strong>{user.displayName ?? "Unnamed user"}</strong><small>{user.email ?? "No email on current identity"}</small><code>{user.userId}</code></td>
          <td data-label="Role / state"><strong>{user.role.replaceAll("_", " ")}</strong><small>{user.accountState}</small></td>
          <td data-label="CA profile">{user.caLevel ?? "—"}<small>{[user.groupChoice, user.attemptKey].filter(Boolean).join(" · ") || "—"}</small></td>
          <td data-label="Plan">{user.planName ?? "Free / no active paid subscription"}</td>
          <td data-label="Last seen">{when(user.lastSeenAt)}</td>
          <td data-label="Created">{when(user.createdAt)}</td>
        </tr>) : <tr><td colSpan={6} data-label="Results">No users matched this search.</td></tr>}</tbody>
      </table>
    </div>

    <nav aria-label="User results pages" className="data-pagination">
      {result.page > 1 ? <Link href={pageHref(result.page - 1)}>← Previous</Link> : <span/>}
      {result.page < result.totalPages ? <Link href={pageHref(result.page + 1)}>Next →</Link> : <span/>}
    </nav>
  </main>;
}
