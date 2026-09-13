import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
const stateMeta = { error: { icon: "alert" as IconName, label: "Error" }, offline: { icon: "cloud-off" as IconName, label: "Offline" }, stale: { icon: "clock" as IconName, label: "Update available" } };
export function StatusState({ state, title, description, action }: { state: keyof typeof stateMeta; title: string; description: string; action?: ReactNode }) {
  const meta = stateMeta[state];
  return <section className={"ui-status-state ui-status-state--" + state} role={state === "error" ? "alert" : "status"} aria-label={meta.label}><div className="ui-status-state__icon"><Icon name={meta.icon} /></div><div><strong>{title}</strong><p>{description}</p>{action ? <div className="ui-status-state__action">{action}</div> : null}</div></section>;
}

