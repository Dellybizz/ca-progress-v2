import Link from "next/link";

export default function NotFound() {
  return <div className="progress-page"><div className="progress-empty"><h2>Progress selection not found</h2><p>Review your academic profile and verified attempt.</p><Link href="/settings/profile" className="ui-text-link">Review profile</Link></div></div>;
}
