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
import { RouteTrail } from "./route-trail";
import { MobileAppBar } from "./mobile-app-bar";
import { AdaptiveShellRuntime } from "./adaptive-shell-runtime";
import {FloatingNavigation} from "./floating-navigation";
import {Icon} from "@/components/ui/icon";
import { OfflineSyncStatus } from "@/components/offline/offline-sync-status";

export function AppShell({ children, area = "student", viewer, studentContext, attempts = [] }: { children: React.ReactNode; area?: "student" | "admin"; viewer: ViewerSnapshot; studentContext?: StudentContextContract; attempts?: AttemptOption[] }) {
  /* Stable labels retained for operational search: Student workspace; Admin workspace */
  const workspaceLabel = area === "admin" ? "Operations" : "Student workspace";
  const homeHref = area === "admin" ? "/admin" : "/dashboard";
  const selection=studentContext?.selection;
  const attemptLabel=selection?attempts.find(attempt=>attempt.key===selection.attemptKey)?.label||'Attempt not set':'';
  const academicLabel=selection?`${selection.level} · ${attemptLabel}`:undefined;
  return <ViewerProvider viewer={viewer}>
    <AppearanceRuntime/><AdaptiveShellRuntime/><NavigationProgress/><MobileOverscrollGuard/><EnvironmentBanner/>
    <div className={`app-shell app-shell--r3${area==='student'?' app-shell--floating':''}`}>
      {area==='admin'?<aside className="desktop-sidebar" aria-label={`${area} workspace`}>
        <Link href={homeHref} className="sidebar-brand"><span className="sidebar-brand__mark">CP</span><span><strong>CA Progress</strong><small>{workspaceLabel}</small></span></Link>
        <DesktopNavigation area={area}/>
        <div className="sidebar-spacer"/>
        {studentContext ? <AttemptSwitcher context={studentContext} attempts={attempts}/> : null}
        <Link href={viewer.authenticated ? "/settings/profile" : "/login?next=%2Fdashboard"} className="shell-identity"><Avatar name={viewer.label} src={viewer.avatarUrl} size={34}/><span><strong>{viewer.authenticated ? viewer.label : "Sign in"}</strong><small>{viewer.authenticated ? (viewer.role ?? "Account") : "Sync your CA Progress account"}</small></span></Link>
        {area === "admin" ? <Link className="sidebar-switch" href="/dashboard">Student workspace</Link> : null}
      </aside>:null}
      <div className="app-main">
        <header className="topbar">
          {area==='student'?<Link href={homeHref} className="floating-brand" aria-label="CA Progress home"><Icon name="book" size={28}/><span>CA Progress</span></Link>:null}
          <MobileAppBar area={area} homeHref={homeHref}/>
          <div className="topbar-context"><span className="topbar-context__dot"/><div><strong>{workspaceLabel}</strong><span>{studentContext?.selection ? `${studentContext.selection.level.replace("_", " ")} · ${studentContext.selection.group.replace("_", " ")}` : "CA Progress"}</span></div></div>
          <TopbarControls area={area} navigation={area==='student'?<FloatingNavigation context={studentContext} attempts={attempts}/>:undefined} academicLabel={area==='student'?academicLabel:undefined}/>
        </header>
        <main className="content-wrap"><RouteTrail homeHref={homeHref}/>{children}</main>
      </div>
    </div>
    {studentContext ? <OfflineSyncStatus/> : null}
    <MobileNavigation area={area} studentContext={studentContext} attempts={attempts}/>
  </ViewerProvider>;
}
