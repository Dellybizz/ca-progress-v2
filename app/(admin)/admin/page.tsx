import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { getAdminCommandCenterMetrics } from "@/lib/admin/phase1";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin Command Center | CA Progress" };

const cards = [
  { key: "users", label: "Total users", href: "/admin/users" },
  { key: "activeUsers", label: "Active accounts", href: "/admin/users" },
  { key: "staff", label: "Staff", href: "/admin/staff" },
  { key: "pendingIcaiReviews", label: "Pending ICAI reviews", href: "/admin/icai-sync" },
  { key: "failedJobs", label: "Failed / dead-letter jobs", href: "/admin/jobs" },
  { key: "auditEvents24h", label: "Admin actions · 24h", href: "/admin/audit" },
] as const;

const shell: React.CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: "28px 22px 52px" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 };
const card: React.CSSProperties = { display: "block", padding: 18, border: "1px solid var(--border, #e8e5ee)", borderRadius: 14, background: "var(--surface, #fff)", color: "inherit", textDecoration: "none" };
const section: React.CSSProperties = { marginTop: 28, padding: 20, border: "1px solid var(--border, #e8e5ee)", borderRadius: 16, background: "var(--surface, #fff)" };

export default async function AdminPage() {
  const actor = await requireAdminPageCapability("admin.dashboard.read");
  const metrics = await getAdminCommandCenterMetrics();
  return <main style={shell}>
    <header style={{ marginBottom: 22 }}>
      <p style={{ margin: 0, color: "var(--muted-foreground, #6f6a78)", fontSize: 13 }}>COMMAND CENTER</p>
      <h1 style={{ margin: "6px 0 6px", fontSize: 30 }}>Admin overview</h1>
      <p style={{ margin: 0, color: "var(--muted-foreground, #6f6a78)" }}>Operational monitoring and owner controls. Signed in as <strong>{actor.role.replaceAll("_", " ")}</strong>.</p>
    </header>

    <section style={grid} aria-label="Admin metrics">
      {cards.map((item) => <Link key={item.key} href={item.href} style={card}>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{metrics[item.key].toLocaleString("en-IN")}</div>
        <div style={{ marginTop: 8, color: "var(--muted-foreground, #6f6a78)", fontSize: 14 }}>{item.label}</div>
      </Link>)}
    </section>

    <section style={section}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Attention</h2>
      <div style={grid}>
        <Link href="/admin/users" style={card}><strong>{metrics.disabledUsers}</strong><div style={{ marginTop: 6 }}>Disabled accounts</div></Link>
        <Link href="/admin/icai-sync" style={card}><strong>{metrics.pendingIcaiReviews}</strong><div style={{ marginTop: 6 }}>ICAI changes awaiting review</div></Link>
        <Link href="/admin/jobs" style={card}><strong>{metrics.failedJobs}</strong><div style={{ marginTop: 6 }}>Background jobs requiring attention</div></Link>
      </div>
    </section>

    <section style={section}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Routine operations</h2>
      <div style={grid}>
        <Link href="/admin/consistency" style={card}><strong>Consistency scanner</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>Review cross-system findings, evidence and safe repairs.</div></Link>
        <Link href="/admin/health" style={card}><strong>System health</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>See plain-language health and recovery queues.</div></Link>
        <Link href="/admin/control" style={card}><strong>Control centre</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>Draft, publish and restore operational configuration.</div></Link>
        <Link href="/admin/plans" style={card}><strong>Plans & entitlements</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>Review student plan availability.</div></Link>
        <Link href="/admin/notifications" style={card}><strong>Notifications</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>Review templates and delivery health.</div></Link>
      </div>
    </section>

    <section style={section}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Owner workspaces</h2>
      <div style={grid}>
        <Link href="/admin/users" style={card}><strong>Users</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>Search identity, CA profile and plan context.</div></Link>
        <Link href="/admin/staff" style={card}><strong>Staff & roles</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>Review privileged accounts and owner-governed roles.</div></Link>
        <Link href="/admin/audit" style={card}><strong>Audit log</strong><div style={{ marginTop: 6, color: "var(--muted-foreground, #6f6a78)" }}>Inspect immutable privileged-action history.</div></Link>
      </div>
    </section>
  </main>;
}
