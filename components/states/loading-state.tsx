export function LoadingState({ label }: { label: string }) {
  return (
    <main className="public-content" aria-busy="true" aria-label={label}>
      <p className="eyebrow">CA Progress V2</p>
      <h1 className="page-title">{label}</h1>
      <div className="placeholder-grid" style={{ marginTop: 20 }}>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </main>
  );
}
