import Link from "next/link";
export default function NotFound() { return <div className="phase7-page"><div className="phase7-empty"><strong>Note not found</strong><p>The note is private, unavailable, or no longer exists.</p><Link className="ui-button ui-button--primary" href="/notes">Back to Notes</Link></div></div>; }
