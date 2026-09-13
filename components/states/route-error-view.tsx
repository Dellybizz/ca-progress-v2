"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPanel } from "./status-panel";

export function RouteErrorView({ title = "This preview hit a temporary issue", message = "The V2 shell is safe. Retry this route or return to the dashboard.", reset }: { title?: string; message?: string; reset?: () => void; error?: Error & { digest?: string } }) {
  const router = useRouter();
  return <StatusPanel tone="danger" eyebrow="Nothing was changed" title={title} description={message} action={<div className="route-error__actions">{reset ? <Button onClick={reset}>Try again</Button> : null}<Button variant="secondary" onClick={() => router.push("/dashboard")}>Go to dashboard</Button></div>}/>;
}
