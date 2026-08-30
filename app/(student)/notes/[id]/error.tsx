"use client";
import { Button } from "@/components/ui/button";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase7-page"><div className="phase7-empty"><strong>Note could not be loaded</strong><p>No note content was changed.</p><Button onClick={reset}>Try again</Button></div></div>; }
