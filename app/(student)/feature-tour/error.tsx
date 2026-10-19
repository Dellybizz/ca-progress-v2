"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="feature-tour">
      <h1>Feature Tour could not open</h1>
      <p>Your existing CA Progress data was not changed.</p>
      <button className="ui-button ui-button--primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
