import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { MobileNavigation } from "./mobile-nav-placeholder";
import { DesktopNavigation } from "./navigation";
import { TopbarControls } from "./topbar-controls";
import { Icon } from "@/components/ui/icon";
import { loadViewer, type Viewer } from "@/lib/auth/server";
import { getAdminOperator } from "@/lib/authorization/server";

const guestViewer: Viewer = { authenticated: false, label: "Guest", initial: "G" };

export async function AppShell({ children, area = "student" }: { children: React.ReactNode; area?: "student" | "admin" }) {
  let viewer: Viewer;
  try {
    viewer = await loadViewer();
  } catch (error) {
    console.error("[app-shell] viewer lookup failed; rendering guest shell", error);
    viewer = guestViewer;
  }

  let adminAllowed = area !== "admin";
  if (area === "admin") {
    try {
      adminAllowed = (await getAdminOperator()).allowed;
    } catch {
      adminAllowed = false;
    }
  }
  const navigationArea = area === "admin" && adminAllowed ? "admin" : "student";
  const workspaceLabel = area === "admin" ? (adminAllowed ? "Admin workspace" : "Restricted workspace") : "Student workspace";

  return <><EnvironmentBanner/><div className={`app-shell${area === "admin" && !adminAllowed ? " admin-shell--denied" : ""}`}><aside className="desktop-sidebar" aria-label={`${area} workspace`}><Link href={area === "admin" ? "/admin" : "/dashboard"} className="sidebar-brand"><span className="sidebar-brand__mark">CP</span><span><strong>CA Progress</strong><small>Focused. Clear. Consistent.</small></span></Link>{area !== "admin" || adminAllowed ? <><div className="sidebar-section-label">Workspace</div><DesktopNavigation area={area}/></> : null}<div className="sidebar-spacer"/>{area !== "admin" || adminAllowed ? <div className="sidebar-status"><span className="sidebar-status__icon"><Icon name={viewer.authenticated ? "shield" : "sparkles"} size={17}/></span><div><strong>{viewer.authenticated ? "Signed in" : "Guest mode"}</strong><span>{viewer.authenticated ? "Private sync enabled" : "Local-only basic access"}</span></div></div> : null}{viewer.authenticated && (area !== "admin" || adminAllowed) ? <Link className="sidebar-switch" href={area === "admin" ? "/logout?next=%2Fadmin" : "/logout?next=%2Fdashboard"}><Icon name="arrow" size={17}/>Sign out</Link> : null}{area === "admin" ? <Link className="sidebar-switch" href="/dashboard"><Icon name="home" size={17}/>Student workspace</Link> : <Link className="sidebar-switch" href="/admin"><Icon name="shield" size={17}/>Admin operations</Link>}</aside><div className="app-main"><header className="topbar"><Link href={area === "admin" ? "/admin" : "/dashboard"} className="mobile-brand"><span className="sidebar-brand__mark">CP</span><span><strong>{area === "admin" ? "Admin" : "CA Progress"}</strong><small>Phase 12 staging</small></span></Link><div className="topbar-context"><span className="topbar-context__dot"/><div><strong>{workspaceLabel}</strong><span>{viewer.authenticated ? `Signed in as ${viewer.label}` : "Browsing as guest"}</span></div></div><TopbarControls viewer={viewer} area={navigationArea}/></header><main className="content-wrap">{children}</main></div></div><MobileNavigation area={area} authorized={adminAllowed}/></>;
}
