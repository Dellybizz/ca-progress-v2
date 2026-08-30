import Link from "next/link";
export default function NotFound() { return <div className="phase7-page"><div className="phase7-empty"><strong>Resource not found</strong><p>The file is private, awaiting moderation, unavailable, or no longer exists.</p><Link className="ui-button ui-button--primary" href="/resources">Back to Resources</Link></div></div>; }
