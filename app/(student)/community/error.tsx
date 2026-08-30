"use client";
export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase10-page"><div className="phase10-route-error"><strong>Community could not be loaded.</strong><p>{error.message || "Try again in a moment."}</p><button className="ui-button ui-button--primary" onClick={reset}>Try again</button></div></div>; }
