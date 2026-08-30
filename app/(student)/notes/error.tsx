"use client";
import { Button } from "@/components/ui/button";
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="phase7-page"><div className="phase7-empty"><strong>Notes library could not be loaded</strong><p>Your notes and private files were not changed.</p><Button onClick={reset}>Try again</Button></div></div>; }
