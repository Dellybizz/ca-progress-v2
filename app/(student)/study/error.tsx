"use client";
import { Button } from "@/components/ui/button";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase6-page"><div className="phase6-empty"><strong>Study timer could not be loaded</strong><p>Your persisted timer/session rows were not changed.</p><Button onClick={reset}>Try again</Button></div></div>; }
