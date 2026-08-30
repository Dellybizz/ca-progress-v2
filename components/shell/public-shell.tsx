import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EnvironmentBanner />
      <div className="public-shell">
        <header className="public-header">
          <Link href="/dashboard" className="public-brand">
            <span className="sidebar-brand__mark">CP</span>
            <span>
              <strong>CA Progress</strong>
              <small>Focused. Clear. Consistent.</small>
            </span>
          </Link>
          <Badge tone="brand">V2 staging</Badge>
        </header>

        <div className="public-grid">
          <aside className="public-visual">
            <div className="public-visual__orb" />
            <div className="public-visual__content">
              <span className="public-kicker"><Icon name="sparkles" size={16} />Built for focused CA preparation</span>
              <h1>One focused workspace for your complete CA journey.</h1>
              <p>Keep your syllabus, verified ICAI updates, study context and progress workspace together without the noise of scattered tools.</p>
              <div className="public-proof">
                <span><Icon name="check" />Verified academic structure</span>
                <span><Icon name="check" />Official ICAI sources</span>
                <span><Icon name="check" />Private account sync</span>
              </div>
            </div>
          </aside>
          <main className="public-content">{children}</main>
        </div>
      </div>
    </>
  );
}
