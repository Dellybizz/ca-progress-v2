"use client";

export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="phase9-page"><div className="phase9-route-error"><strong>Today Plan could not be generated.</strong><p>We couldn’t load today’s plan. Please try again. Your saved study and progress data has not been changed.</p>{error.digest ? <small>Support code: {error.digest}</small> : null}<button className="ui-button ui-button--primary" onClick={reset}>Try again</button></div></div>;
}
