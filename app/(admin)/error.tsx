"use client";
import { RouteErrorView } from "@/components/states/route-error-view";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <RouteErrorView title="Admin preview could not load" reset={reset} />; }
