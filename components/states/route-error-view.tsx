"use client";

export function RouteErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="public-content">
      <p className="eyebrow">CA Progress V2</p>
      <h1 className="page-title">This V2 route could not load.</h1>
      <section className="state-card" data-tone="danger">
        <h2>Safe error state</h2>
        <p>{error.digest ? `Reference: ${error.digest}` : "No sensitive diagnostic details are exposed here."}</p>
        <div className="error-actions"><button type="button" onClick={reset}>Try again</button></div>
      </section>
    </main>
  );
}
