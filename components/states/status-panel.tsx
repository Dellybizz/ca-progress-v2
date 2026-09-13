import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "permission" | "stale";

const toneIcons: Record<StatusTone, IconName> = {
  neutral: "sparkles",
  info: "bell",
  success: "check",
  warning: "clock",
  danger: "shield",
  permission: "settings",
  stale: "clock",
};

export function StatusPanel({ tone = "neutral", eyebrow, title, description, action, compact = false, role }: {
  tone?: StatusTone;
  eyebrow?: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  role?: "alert" | "status";
}) {
  return (
    <section className={`status-panel status-panel--${tone}${compact ? " status-panel--compact" : ""}`} role={role ?? (tone === "danger" ? "alert" : "status")}>
      <span className="status-panel__icon" aria-hidden="true"><Icon name={toneIcons[tone]} size={18}/></span>
      <div className="status-panel__copy">
        {eyebrow ? <span className="status-panel__eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        <div className="status-panel__description">{description}</div>
        {action ? <div className="status-panel__action">{action}</div> : null}
      </div>
    </section>
  );
}
