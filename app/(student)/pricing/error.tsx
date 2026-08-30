"use client";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase11-page"><div className="phase11-route-error"><strong>Plans could not be loaded.</strong><p>Retry the pricing screen.</p><button className="ui-button ui-button--primary" onClick={reset}>Try again</button></div></div>; }
