"use client";
import { Button } from "@/components/ui/button";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase6-page"><div className="phase6-empty"><strong>Planner could not be loaded</strong><p>Your tasks and goals were not changed.</p><Button onClick={reset}>Try again</Button></div></div>; }
