import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { MobileNavigation } from "./mobile-navigation";
import { MobileOverscrollGuard } from "./mobile-overscroll-guard";
import { DesktopNavigation } from "./navigation";
import { TopbarControls } from "./topbar-controls";
import { ViewerStatus } from "./viewer-status";
import { NavigationProgress } from "./navigation-progress";
import { Icon } from "@/components/ui/icon";

export function AppShell({ children, area = "student" }: { children: React.ReactNode; area?: "student" | "admin" }) {
  const workspaceLabel = area === "admin" ? "Admin workspace" : "Student workspace";
  const homeHref = area === "admin" ? "/admin" : "/dashboard";

  return (
    <>
      <NavigationProgress/>
      <MobileOverscrollGuard/>
      <EnvironmentBanner/>
      <div className="app-shell">
        <aside className="desktop-sidebar" aria-label={`${area} workspace`}>
          <Link href={homeHref} className="sidebar-brand">
            <span className="sidebar-brand__mark">CP</span>
            <span><strong>CA Progress</strong><small>{workspaceLabel}</small></span>
          </Link>
          <DesktopNavigation area={area}/>
          <div className="sidebar-spacer"/>
          <ViewerStatus/>
          {area === "admin" ? <Link className="sidebar-switch" href="/dashboard"><Icon name="home" size={16}/>Student workspace</Link> : null}
        </aside>

        <div className="app-main">
          <header className="topbar">
            <Link href={homeHref} className="mobile-brand">
              <span className="sidebar-brand__mark">CP</span>
              <span><strong>CA Progress</strong><small>{workspaceLabel}</small></span>
            </Link>
            <div className="topbar-context">
              <div><strong>{workspaceLabel}</strong><span>CA Progress</span></div>
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
