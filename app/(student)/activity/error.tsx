"use client";
import { Button } from "@/components/ui/button";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase6-page"><div className="phase6-empty"><strong>Activity could not be loaded</strong><p>The timeline is derived from existing study/progress rows, so no source data was changed.</p><Button onClick={reset}>Try again</Button></div></div>; }
