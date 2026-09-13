"use client";
import { RouteErrorView } from "@/components/states/route-error-view";
export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <RouteErrorView title="This Community channel could not be loaded" message={error.message || "Try again in a moment."} reset={reset}/>; }
