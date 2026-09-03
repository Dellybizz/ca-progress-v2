import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { MobileNavigation } from "./mobile-nav-placeholder";
import { MobileOverscrollGuard } from "./mobile-overscroll-guard";
import { DesktopNavigation } from "./navigation";
import { TopbarControls } from "./topbar-controls";
import { ViewerStatus } from "./viewer-status";
import { NavigationProgress } from "./navigation-progress";
import { Icon } from "@/components/ui/icon";

export function AppShell({ children, area = "student" }: { children: React.ReactNode; area?: "student" | "admin" }) {
  return (
    <>
      <NavigationProgress/>
      <MobileOverscrollGuard/>
      <EnvironmentBanner/>
      <div className="app-shell">
        <aside className="desktop-sidebar" aria-label={`${area} workspace`}>
          <Link href={area === "admin" ? "/admin" : "/dashboard"} className="sidebar-brand">
            <span className="sidebar-brand__mark">CP</span>
            <span><strong>CA Progress</strong><small>Focused. Clear. Consistent.</small></span>
          </Link>
          <div className="sidebar-section-label">Workspace</div>
          <DesktopNavigation area={area}/>
          <div className="sidebar-spacer"/>
          <ViewerStatus/>
          {area === "admin" ? <Link className="sidebar-switch" href="/dashboard"><Icon name="home" size={16}/>Student workspace</Link> : null}
        </aside>

        <div className="app-main">
          <header className="topbar">
            <Link href={area === "admin" ? "/admin" : "/dashboard"} className="mobile-brand">
              <span className="sidebar-brand__mark">CP</span>
              <span><strong>{area === "admin" ? "Admin" : "CA Progress"}</strong><small>Staging</small></span>
            </Link>
            <div className="topbar-context">
              <span className="topbar-context__dot"/>
              <div><strong>{area === "admin" ? "Admin workspace" : "Student workspace"}</strong><span>Workspace ready</span></div>
            </div>
            <TopbarControls/>
          </header>
          <main className="content-wrap">{children}</main>
        </div>
      </div>
      <MobileNavigation area={area}/>
    </>
  );
}
