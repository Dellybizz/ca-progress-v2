import Link from "next/link";

export default function NotFound() {
  return <div className="progress-page"><div className="progress-empty"><h2>Subject progress not found</h2><p>This subject may not be applicable to the current level, group or attempt.</p><Link href="/progress" className="ui-text-link">Back to progress</Link></div></div>;
}
