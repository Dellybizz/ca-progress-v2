import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { MobileNavigation } from "./mobile-nav-placeholder";
import { DesktopNavigation } from "./navigation";
import { TopbarControls } from "./topbar-controls";
import { Icon } from "@/components/ui/icon";
import { loadViewer, type Viewer } from "@/lib/auth/server";

const guestViewer: Viewer = { authenticated: false, label: "Guest", initial: "G" };

export async function AppShell({ children, area = "student" }: { children: React.ReactNode; area?: "student" | "admin" }) {
  let viewer: Viewer;
  try {
    viewer = await loadViewer();
  } catch (error) {
    // A transient auth/profile lookup must not take down every page that uses
    // the shared shell. Protected routes still enforce authorization in their
    // own server loaders/actions; this fallback only keeps the shell renderable.
    console.error("[app-shell] viewer lookup failed; rendering guest shell", error);
    viewer = guestViewer;
  }

  return <><EnvironmentBanner/><div className="app-shell"><aside className="desktop-sidebar" aria-label={`${area} workspace`}><Link href={area === "admin" ? "/admin" : "/dashboard"} className="sidebar-brand"><span className="sidebar-brand__mark">CP</span><span><strong>CA Progress</strong><small>Focused. Clear. Consistent.</small></span></Link><div className="sidebar-section-label">Workspace</div><DesktopNavigation area={area}/><div className="sidebar-spacer"/><div className="sidebar-status"><span className="sidebar-status__icon"><Icon name={viewer.authenticated ? "shield" : "sparkles"} size={17}/></span><div><strong>{viewer.authenticated ? "Signed in" : "Guest mode"}</strong><span>{viewer.authenticated ? "Private sync enabled" : "Local-only basic access"}</span></div></div>{area === "admin" ? <Link className="sidebar-switch" href="/dashboard"><Icon name="home" size={17}/>Student workspace</Link> : <Link className="sidebar-switch" href="/admin"><Icon name="shield" size={17}/>Admin preview</Link>}</aside><div className="app-main"><header className="topbar"><Link href={area === "admin" ? "/admin" : "/dashboard"} className="mobile-brand"><span className="sidebar-brand__mark">CP</span><span><strong>{area === "admin" ? "Admin" : "CA Progress"}</strong><small>Phase 10 staging</small></span></Link><div className="topbar-context"><span className="topbar-context__dot"/><div><strong>{area === "admin" ? "Admin workspace" : "Student workspace"}</strong><span>{viewer.authenticated ? `Signed in as ${viewer.label}` : "Browsing as guest"}</span></div></div><TopbarControls viewer={viewer}/></header><main className="content-wrap">{children}</main></div></div><MobileNavigation area={area}/></>;
}
