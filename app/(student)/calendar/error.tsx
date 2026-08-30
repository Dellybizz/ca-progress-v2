"use client";
import { Button } from "@/components/ui/button";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase6-page"><div className="phase6-empty"><strong>Calendar could not be loaded</strong><p>Your source records remain unchanged. Official ICAI events are never edited here.</p><Button onClick={reset}>Try again</Button></div></div>; }
