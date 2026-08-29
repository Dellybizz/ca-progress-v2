import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { MobileNavPlaceholder } from "./mobile-nav-placeholder";

const studentNav = [
  ["Dashboard", "/dashboard"],
  ["Planner", "#"],
  ["Progress", "#"],
  ["Study", "#"],
  ["Notes", "#"],
  ["Community", "#"],
];

const adminNav = [
  ["Admin overview", "/admin"],
  ["Members", "#"],
  ["System", "#"],
];

export function AppShell({ children, area = "student" }: { children: React.ReactNode; area?: "student" | "admin" }) {
  const nav = area === "admin" ? adminNav : studentNav;
  return (
    <>
      <EnvironmentBanner />
      <div className="app-shell">
        <aside className="desktop-sidebar" aria-label={`${area} navigation placeholder`}>
          <div className="brand">
            <div className="brand-mark">CA</div>
            <div className="brand-copy"><strong>CA Progress</strong><span>V2 foundation</span></div>
          </div>
          <nav>
            {nav.map(([label, href]) => href === "#" ? <span key={label}>{label} · later</span> : <Link key={label} href={href}>{label}</Link>)}
          </nav>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark">CA</div>
              <div className="brand-copy"><strong>{area === "admin" ? "Admin foundation" : "Student foundation"}</strong><span>Old production is disconnected</span></div>
            </div>
            <span className="phase-chip">Phase 0</span>
          </header>
          <main className="content-wrap">{children}</main>
        </div>
      </div>
      <MobileNavPlaceholder area={area} />
    </>
  );
}
