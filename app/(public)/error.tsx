"use client";
import { RouteErrorView } from "@/components/states/route-error-view";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <RouteErrorView title="This preview could not load" reset={reset} />; }
