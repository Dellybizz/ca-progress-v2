import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { MobileNavigation } from "./mobile-navigation";
import { MobileOverscrollGuard } from "./mobile-overscroll-guard";
import { DesktopNavigation } from "./navigation";
import { TopbarControls } from "./topbar-controls";
import { NavigationProgress } from "./navigation-progress";
import { AppearanceRuntime } from "@/components/preferences/appearance-runtime";
import { ViewerProvider, type ViewerSnapshot } from "./viewer-client";
import { Avatar } from "@/components/ui/avatar";
import { AttemptSwitcher } from "./attempt-switcher";
import type { AttemptOption } from "@/lib/profile/validation";
import type { StudentContextContract } from "@/lib/academic/student-context";

export function AppShell({ children, area = "student", viewer, studentContext, attempts = [] }: { children: React.ReactNode; area?: "student" | "admin"; viewer: ViewerSnapshot; studentContext?: StudentContextContract; attempts?: AttemptOption[] }) {
  /* Stable labels retained for operational search: Student workspace; Admin workspace */
  const workspaceLabel = area === "admin" ? "Operations" : "Study workspace";
  const homeHref = area === "admin" ? "/admin" : "/dashboard";
  return <ViewerProvider viewer={viewer}>
    <AppearanceRuntime/><NavigationProgress/><MobileOverscrollGuard/><EnvironmentBanner/>
    <div className="app-shell app-shell--r3">
      <aside className="desktop-sidebar" aria-label={`${area} workspace`}>
        <Link href={homeHref} className="sidebar-brand"><span className="sidebar-brand__mark">CP</span><span><strong>CA Progress</strong><small>{workspaceLabel}</small></span></Link>
        <DesktopNavigation area={area}/>
        <div className="sidebar-spacer"/>
        {studentContext ? <AttemptSwitcher context={studentContext} attempts={attempts}/> : null}
        <Link href="/settings/profile" className="shell-identity"><Avatar name={viewer.label} src={viewer.avatarUrl} size={34}/><span><strong>{viewer.label}</strong><small>{viewer.role ?? "Account"}</small></span></Link>
        {area === "admin" ? <Link className="sidebar-switch" href="/dashboard">Student workspace</Link> : null}
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Link href={homeHref} className="mobile-brand"><span className="sidebar-brand__mark">CP</span><span><strong>CA Progress</strong><small>{workspaceLabel}</small></span></Link>
          <div className="topbar-context"><span className="topbar-context__dot"/><div><strong>{workspaceLabel}</strong><span>{studentContext?.selection ? `${studentContext.selection.level.replace("_", " ")} · ${studentContext.selection.group.replace("_", " ")}` : "CA Progress"}</span></div></div>
          <TopbarControls area={area}/>
        </header>
        <main className="content-wrap">{children}</main>
      </div>
    </div>
    <MobileNavigation area={area} studentContext={studentContext} attempts={attempts}/>
  </ViewerProvider>;
}
