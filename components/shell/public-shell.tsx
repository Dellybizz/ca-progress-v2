import Link from "next/link";
import { EnvironmentBanner } from "./environment-banner";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EnvironmentBanner />
      <div className="public-shell">
        <header className="public-header">
          <Link href="/dashboard" className="brand">
            <span className="brand-mark">CA</span>
            <span className="brand-copy"><strong>CA Progress</strong><span>V2 staging foundation</span></span>
          </Link>
        </header>
        <main className="public-content">{children}</main>
      </div>
    </>
  );
}
