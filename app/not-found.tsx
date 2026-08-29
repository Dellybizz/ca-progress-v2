import Link from "next/link";
import { EnvironmentBanner } from "@/components/shell/environment-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return <><EnvironmentBanner/><main className="not-found-wrap"><EmptyState icon="search" title="This route is not in the V2 workspace" description="The staging experience only exposes routes defined by the phased roadmap." action={<Link href="/dashboard"><Button>Back to dashboard</Button></Link>}/></main></>;
}
