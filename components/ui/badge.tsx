import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
export function Badge({ tone = "neutral", className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`} {...props} />;
}
