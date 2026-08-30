import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function AdminDenied({ message = "You do not have access to this operations surface." }: { message?: string }) {
  return <div className="phase12-page"><section className="phase12-denied"><span><Icon name="shield" size={28}/></span><h1>Operations access required</h1><p>{message}</p><Link href="/dashboard">Return to student workspace</Link></section></div>;
}

export function HealthBadge({ state }: { state: string }) {
  return <span className={`phase12-health phase12-health--${state}`}><i/>{state.replace("_"," ")}</span>;
}
