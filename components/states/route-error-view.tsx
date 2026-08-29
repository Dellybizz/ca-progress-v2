"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function RouteErrorView({ title = "This preview hit a temporary issue", message = "The V2 shell is safe. Retry this route or return to the dashboard.", reset }: { title?: string; message?: string; reset?: () => void; error?: Error & { digest?: string } }) {
  const router = useRouter();
  return <section className="route-error" role="alert"><div className="route-error__icon"><Icon name="shield" size={22}/></div><div><span className="eyebrow">Safe error state</span><h1>{title}</h1><p>{message}</p><div className="route-error__actions">{reset ? <Button onClick={reset}>Try again</Button> : null}<Button variant="secondary" onClick={() => router.push("/dashboard")}>Go to dashboard</Button></div></div></section>;
}
