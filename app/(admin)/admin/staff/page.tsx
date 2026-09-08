import type { Metadata } from "next";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { hasAdminCapability } from "@/lib/authorization/capabilities.mjs";
import { listAdminStaff } from "@/lib/admin/phase1";
import { changeStaffRole } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff & Roles | CA Progress Admin" };

function param(value: string | string[] | undefined) { return typeof value === "string" ? value : null; }
function when(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
const shell: React.CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: "28px 22px 52px" };
const card: React.CSSProperties = { padding: 18, border: "1px solid var(--border, #e8e5ee)", borderRadius: 14, background: "var(--surface, #fff)" };

export default async function AdminStaffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireAdminPageCapability("staff.read");
  const params = await searchParams;
  const staff = await listAdminStaff();
  const canManage = hasAdminCapability(actor.role, "staff.manage");
  const canManageParentOwner = hasAdminCapability(actor.role, "parent_owner.manage");
  const notice = param(params.notice);
  const error = param(params.error);

  return <main style={shell}>
    <header style={{ marginBottom: 20 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground, #6f6a78)" }}>PEOPLE</p>
      <h1 style={{ margin: "6px 0", fontSize: 28 }}>Staff & roles</h1>
      <p style={{ margin: 0, color: "var(--muted-foreground, #6f6a78)" }}>Privileged accounts are governed by server-side capabilities. Every role change requires a reason and is written to the immutable admin audit log.</p>
    </header>

    {notice ? <div role="status" style={{ ...card, marginBottom: 14 }}>{notice}</div> : null}
    {error ? <div role="alert" style={{ ...card, marginBottom: 14, borderColor: "#d7a5a5" }}>{error}</div> : null}

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 18 }}>
      {[
        ["Moderator", "Community, resource and anti-cheat review only."],
        ["Admin", "Operational monitoring and routine admin actions; no paid reward settlement or staff-role writes."],
        ["Owner", "Owner controls, including staff management and reward settlement; cannot grant Parent Owner."],
        ["Parent Owner", "Highest authority, including Parent Owner hierarchy management."],
      ].map(([title, text]) => <div style={card} key={title}><strong>{title}</strong><p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-foreground, #6f6a78)" }}>{text}</p></div>)}
    </section>

    <div style={{ display: "grid", gap: 12 }}>
      {staff.length ? staff.map((member) => {
        const targetParentOwner = member.role === "parent_owner";
        const editable = canManage && member.userId !== actor.user.id && (!targetParentOwner || canManageParentOwner);
        return <article key={member.userId} style={card}>
          <div style={{ display: "flex", gap: 16, justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ minWidth: 240, flex: "1 1 340px" }}>
              <strong style={{ fontSize: 16 }}>{member.displayName ?? "Unnamed staff account"}</strong>
              <div style={{ marginTop: 5 }}>{member.email ?? "No email on current identity"}</div>
              <code style={{ display: "block", marginTop: 6, fontSize: 11 }}>{member.userId}</code>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted-foreground, #6f6a78)" }}>{member.role.replaceAll("_", " ")} · {member.accountState} · last seen {when(member.lastSeenAt)}</div>
            </div>
            {editable ? <form action={changeStaffRole} style={{ display: "grid", gap: 8, minWidth: 280, flex: "0 1 380px" }}>
              <input type="hidden" name="userId" value={member.userId}/>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Role
                <select name="role" defaultValue={member.role} style={{ padding: "9px 10px", border: "1px solid var(--border, #ddd8e7)", borderRadius: 9, background: "var(--surface, #fff)", color: "inherit" }}>
                  <option value="student">Student</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                  {canManageParentOwner ? <option value="parent_owner">Parent Owner</option> : null}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Reason
                <input name="reason" required minLength={3} maxLength={1000} placeholder="Why is this role changing?" style={{ padding: "9px 10px", border: "1px solid var(--border, #ddd8e7)", borderRadius: 9, background: "var(--surface, #fff)", color: "inherit" }}/>
              </label>
              <button type="submit" style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--border, #ddd8e7)", background: "var(--surface, #fff)", cursor: "pointer" }}>Save role</button>
            </form> : <div style={{ fontSize: 13, color: "var(--muted-foreground, #6f6a78)" }}>{member.userId === actor.user.id ? "Self role changes are blocked." : targetParentOwner ? "Parent Owner authority required." : "Read-only for your role."}</div>}
          </div>
        </article>;
      }) : <div style={card}>No privileged staff accounts found.</div>}
    </div>
  </main>;
}
