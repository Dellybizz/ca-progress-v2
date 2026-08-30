import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function FeatureLock({ title, description, planName }: { title: string; description: string; planName?: string }) {
  return <div className="phase11-feature-lock"><span><Icon name="lock"/></span><div><small>{planName ? `${planName} plan` : "Plan access"}</small><strong>{title}</strong><p>{description}</p><div><Link className="ui-button ui-button--primary" href="/pricing">Compare plans</Link><Link className="ui-button ui-button--secondary" href="/billing">View billing</Link></div></div></div>;
}
