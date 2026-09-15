import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { listAdminAudit } from "@/lib/admin/phase1";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin Audit Log | CA Progress" };

function param(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function when(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" }); }
function compactJson(value: string | null) {
  if (!value) return "—";
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}
const shell: React.CSSProperties = { maxWidth: 1240, margin: "0 auto", padding: "28px 22px 52px" };
const card: React.CSSProperties = { padding: 16, border: "1px solid var(--border, #e8e5ee)", borderRadius: 14, background: "var(--surface, #fff)" };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPageCapability("audit.read");
  const params = await searchParams;
  const query = param(params.q) ?? "";
  const events = await listAdminAudit({ query, limit: 100 });

  return <main style={shell}>
    <header style={{ marginBottom: 20 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground, #6f6a78)" }}>SECURITY</p>
      <h1 style={{ margin: "6px 0", fontSize: 28 }}>Admin audit log</h1>
      <p style={{ margin: 0, color: "var(--muted-foreground, #6f6a78)" }}>Immutable privileged-action history. Rows cannot be updated or deleted.</p>
    </header>

    <form method="get" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <input name="q" defaultValue={query} placeholder="Actor, capability, action or target" aria-label="Search audit log" style={{ minWidth: 280, flex: "1 1 420px", padding: "10px 12px", border: "1px solid var(--border, #ddd8e7)", borderRadius: 10, background: "var(--surface, #fff)", color: "inherit" }}/>
      <button type="submit" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border, #ddd8e7)", background: "var(--surface, #fff)", cursor: "pointer" }}>Search</button>
      {query ? <Link href="/admin/audit" style={{ padding: "10px 12px", color: "inherit" }}>Clear</Link> : null}
    </form>

    <div style={{ display: "grid", gap: 10 }}>
      {events.length ? events.map((event) => <article key={event.id} style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div><strong>{event.action}</strong><div style={{ marginTop: 4, fontSize: 13 }}>{event.capability} · {event.actorRole.replaceAll("_", " ")}</div></div>
          <time style={{ fontSize: 12, color: "var(--muted-foreground, #6f6a78)" }}>{when(event.createdAt)}</time>
        </div>
        <div style={{ marginTop: 10, fontSize: 13 }}><strong>Actor:</strong> <code>{event.actorUserId}</code></div>
        <div style={{ marginTop: 5, fontSize: 13 }}><strong>Target:</strong> {event.targetType}{event.targetId ? <> · <code>{event.targetId}</code></> : null}</div>
        {event.reason ? <div style={{ marginTop: 5, fontSize: 13 }}><strong>Reason:</strong> {event.reason}</div> : null}
        {(event.previousValue || event.newValue) ? <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontSize: 13 }}>Before / after</summary><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginTop: 8 }}><pre style={{ ...card, margin: 0, whiteSpace: "pre-wrap", fontSize: 11, overflow: "auto" }}>{compactJson(event.previousValue)}</pre><pre style={{ ...card, margin: 0, whiteSpace: "pre-wrap", fontSize: 11, overflow: "auto" }}>{compactJson(event.newValue)}</pre></div></details> : null}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted-foreground, #6f6a78)" }}>Trace {event.traceId ?? "—"} · {event.reversible ? "Marked reversible" : "No automatic undo"}</div>
      </article>) : <div style={card}>No audit events matched this search.</div>}
    </div>
  </main>;
}
