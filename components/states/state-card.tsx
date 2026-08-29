import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

export function StateCard({ title, children, tone = "neutral" }: { title: string; children: ReactNode; tone?: "neutral" | "danger" | "permission" }) {
  return <section className={`state-card state-card--${tone}`}><span className="state-card__icon"><Icon name={tone === "danger" ? "shield" : tone === "permission" ? "settings" : "sparkles"} size={18}/></span><div><h2>{title}</h2><p>{children}</p></div></section>;
}
