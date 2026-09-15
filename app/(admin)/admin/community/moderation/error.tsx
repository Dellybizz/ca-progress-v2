"use client";
import { RouteErrorView } from "@/components/states/route-error-view";
export default function CommunityModerationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <RouteErrorView title="Community moderation could not be loaded" message={error.message || "Try again in a moment."} reset={reset}/>; }
