"use client";
import { RouteErrorView } from "@/components/states/route-error-view";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <RouteErrorView title="Resource moderation could not be loaded" message="No submission or report state was changed." reset={reset}/>; }
