"use client";
import { RouteErrorView } from "@/components/states/route-error-view";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <RouteErrorView title="Resource library could not be loaded" message="Your private files and moderation state were not changed." reset={reset}/>; }
