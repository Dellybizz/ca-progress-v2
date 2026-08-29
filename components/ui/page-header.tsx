import type { ReactNode } from "react";
import { Badge } from "./badge";

export function PageHeader({ eyebrow, title, description, actions, preview = true }: { eyebrow: string; title: string; description: string; actions?: ReactNode; preview?: boolean }) {
  return (
    <header className="page-header">
      <div className="page-header__copy"><div className="page-header__eyebrow"><span>{eyebrow}</span>{preview ? <Badge tone="brand">Design preview</Badge> : null}</div><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
