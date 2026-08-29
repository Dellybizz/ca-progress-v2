import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { MobileNavigation } from "./mobile-nav-placeholder";
import { DesktopNavigation } from "./navigation";
import { TopbarControls } from "./topbar-controls";
import { Icon } from "@/components/ui/icon";

export function AppShell({ children, area = "student" }: { children: React.ReactNode; area?: "student" | "admin" }) {
  return <><EnvironmentBanner/><div className="app-shell"><aside className="desktop-sidebar" aria-label={`${area} workspace`}><Link href={area === "admin" ? "/admin" : "/dashboard"} className="sidebar-brand"><span className="sidebar-brand__mark">CP</span><span><strong>CA Progress</strong><small>Focused. Clear. Consistent.</small></span></Link><div className="sidebar-section-label">Workspace</div><DesktopNavigation area={area}/><div className="sidebar-spacer"/><div className="sidebar-status"><span className="sidebar-status__icon"><Icon name="sparkles" size={17}/></span><div><strong>Phase 1 UX</strong><span>Design system preview</span></div></div>{area === "admin" ? <Link className="sidebar-switch" href="/dashboard"><Icon name="home" size={17}/>Student workspace</Link> : <Link className="sidebar-switch" href="/admin"><Icon name="shield" size={17}/>Admin preview</Link>}</aside><div className="app-main"><header className="topbar"><Link href={area === "admin" ? "/admin" : "/dashboard"} className="mobile-brand"><span className="sidebar-brand__mark">CP</span><span><strong>{area === "admin" ? "Admin" : "CA Progress"}</strong><small>Phase 1 preview</small></span></Link><div className="topbar-context"><span className="topbar-context__dot"/><div><strong>{area === "admin" ? "Admin design preview" : "Student workspace"}</strong><span>No production data connected</span></div></div><TopbarControls/></header><main className="content-wrap">{children}</main></div></div><MobileNavigation area={area}/></>;
}
