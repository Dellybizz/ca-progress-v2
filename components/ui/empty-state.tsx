import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function EmptyState({ title, description, icon = "sparkles", action, compact = false }: { title: string; description: string; icon?: IconName; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`ui-empty ${compact ? "ui-empty--compact" : ""}`}>
      <div className="ui-empty__icon"><Icon name={icon} size={20} /></div>
      <div><h3>{title}</h3><p>{description}</p>{action ? <div className="ui-empty__action">{action}</div> : null}</div>
    </div>
  );
}
