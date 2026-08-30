"use client";

export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="phase9-page"><div className="phase9-route-error"><strong>Today Plan could not be generated.</strong><p>{error.message || "Try again after checking your profile and planner settings."}</p><button className="ui-button ui-button--primary" onClick={reset}>Try again</button></div></div>;
}
