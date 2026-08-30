import Link from "next/link";

export default function NotFound() {
  return <div className="progress-page"><div className="progress-empty"><h2>Analytics are not available for this selection</h2><p>Review your academic profile or return to the progress tracker.</p><Link href="/progress" className="ui-text-link">Open progress</Link></div></div>;
}
