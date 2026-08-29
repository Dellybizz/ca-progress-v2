import { StateCard } from "./state-card";

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  stateTitle = "Empty by design",
  stateBody = "Feature data and business logic arrive in later phases. Phase 0 establishes only safe boundaries.",
}: {
  eyebrow: string;
  title: string;
  description: string;
  stateTitle?: string;
  stateBody?: string;
}) {
  return (
    <div className="placeholder-page">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="page-lead">{description}</p>
      </header>
      <StateCard title={stateTitle}>{stateBody}</StateCard>
      <div className="placeholder-grid" aria-label="Future content slots">
        <div className="placeholder-block">Future module slot</div>
        <div className="placeholder-block">Future module slot</div>
        <div className="placeholder-block">Future module slot</div>
      </div>
    </div>
  );
}
