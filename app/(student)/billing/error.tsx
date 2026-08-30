"use client";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase11-page"><div className="phase11-route-error"><strong>Billing history could not be loaded.</strong><p>Your subscription data has not been changed.</p><button className="ui-button ui-button--primary" onClick={reset}>Try again</button></div></div>; }
