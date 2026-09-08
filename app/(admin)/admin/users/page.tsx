import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { searchAdminUsers } from "@/lib/admin/phase1";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Users | CA Progress Admin" };

function param(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function when(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
const shell: React.CSSProperties = { maxWidth: 1280, margin: "0 auto", padding: "28px 22px 52px" };
const cell: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid var(--border, #ece9f1)", textAlign: "left", verticalAlign: "top", fontSize: 13 };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPageCapability("users.read");
  const params = await searchParams;
  const query = param(params.q) ?? "";
  const requestedPage = Number(param(params.page) ?? "1");
  const result = await searchAdminUsers({ query, page: requestedPage });
  const pageHref = (page: number) => `/admin/users?${new URLSearchParams({ ...(result.query ? { q: result.query } : {}), page: String(page) }).toString()}`;

  return <main style={shell}>
    <header style={{ marginBottom: 20 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground, #6f6a78)" }}>PEOPLE</p>
      <h1 style={{ margin: "6px 0", fontSize: 28 }}>Users</h1>
      <p style={{ margin: 0, color: "var(--muted-foreground, #6f6a78)" }}>Search by name, email or stable application user ID. Private notes, files and test contents are not exposed here.</p>
    </header>

    <form method="get" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <input name="q" defaultValue={result.query} placeholder="Search users" aria-label="Search users" style={{ minWidth: 280, flex: "1 1 360px", padding: "10px 12px", border: "1px solid var(--border, #ddd8e7)", borderRadius: 10, background: "var(--surface, #fff)", color: "inherit" }}/>
      <button type="submit" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border, #ddd8e7)", background: "var(--surface, #fff)", cursor: "pointer" }}>Search</button>
      {result.query ? <Link href="/admin/users" style={{ padding: "10px 12px", color: "inherit" }}>Clear</Link> : null}
    </form>

    <div style={{ marginBottom: 10, color: "var(--muted-foreground, #6f6a78)", fontSize: 13 }}>{result.total.toLocaleString("en-IN")} matching users · page {result.page} of {result.totalPages}</div>
    <div style={{ overflowX: "auto", border: "1px solid var(--border, #e8e5ee)", borderRadius: 14, background: "var(--surface, #fff)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead><tr>
          {['User','Role / state','CA profile','Plan','Last seen','Created'].map((label) => <th key={label} style={{ ...cell, fontSize: 12, color: "var(--muted-foreground, #6f6a78)", background: "var(--surface-subtle, #faf9fc)" }}>{label}</th>)}
        </tr></thead>
        <tbody>{result.users.length ? result.users.map((user) => <tr key={user.userId}>
          <td style={cell}><strong>{user.displayName ?? "Unnamed user"}</strong><div style={{ marginTop: 3 }}>{user.email ?? "No email on current identity"}</div><code style={{ display: "block", marginTop: 5, fontSize: 11 }}>{user.userId}</code></td>
          <td style={cell}><strong>{user.role.replaceAll("_", " ")}</strong><div style={{ marginTop: 4 }}>{user.accountState}</div></td>
          <td style={cell}>{user.caLevel ?? "—"}<div style={{ marginTop: 4 }}>{[user.groupChoice, user.attemptKey].filter(Boolean).join(" · ") || "—"}</div></td>
          <td style={cell}>{user.planName ?? "Free / no active paid subscription"}</td>
          <td style={cell}>{when(user.lastSeenAt)}</td>
          <td style={cell}>{when(user.createdAt)}</td>
        </tr>) : <tr><td colSpan={6} style={{ ...cell, padding: 28, textAlign: "center" }}>No users matched this search.</td></tr>}</tbody>
      </table>
    </div>

    <nav aria-label="User results pages" style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
      {result.page > 1 ? <Link href={pageHref(result.page - 1)}>← Previous</Link> : <span/>}
      {result.page < result.totalPages ? <Link href={pageHref(result.page + 1)}>Next →</Link> : <span/>}
    </nav>
  </main>;
}
