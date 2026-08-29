"use client";

import { Icon } from "./icon";

export function Toast({ title, description, tone = "neutral", onDismiss }: { title: string; description?: string; tone?: "neutral" | "success" | "danger"; onDismiss?: () => void }) {
  return <div className={`ui-toast ui-toast--${tone}`} role="status"><div className="ui-toast__icon"><Icon name={tone === "success" ? "check" : "sparkles"} size={17} /></div><div><strong>{title}</strong>{description ? <p>{description}</p> : null}</div>{onDismiss ? <button className="ui-icon-button" aria-label="Dismiss notification" onClick={onDismiss}><Icon name="close" size={16} /></button> : null}</div>;
}
