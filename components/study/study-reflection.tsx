"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { StudyFocusRating, StudyPendingReflection } from "@/lib/study/types";

function minutesLabel(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h`;
}

export function StudyReflection({ session }: { session: StudyPendingReflection }) {
  const router = useRouter();
  const [understanding, setUnderstanding] = useState("");
  const [focus, setFocus] = useState<StudyFocusRating | "">("");
  const [doubt, setDoubt] = useState("");
  const [visibility, setVisibility] = useState<"private" | "community">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const [showDoubt, setShowDoubt] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const score = Number(understanding);
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      setError("Enter a whole number from 0 to 100.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/study/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          understandingScore: score,
          focusRating: focus,
          doubtBody: doubt.trim() || null,
          doubtVisibility: doubt.trim() ? visibility : null,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Reflection could not be saved.");
      router.replace("/study");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reflection could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (later) return null;

  return <Card className="study-reflection-card" data-study-session-reflection={session.sessionId}>
    <CardHeader title="Quick reflection" description={`${session.intendedTaskTitle ?? session.chapterTitle ?? session.subjectTitle ?? "Study session"} · ${minutesLabel(session.durationSeconds)}`}/>
    <CardBody>
      <form className="phase6-form study-reflection-form" onSubmit={submit}>
        <label className="study-reflection-score"><span>Self-reported understanding <small>0–100 · self-reported understanding, not a mastery score</small></span><input type="number" inputMode="numeric" min="0" max="100" step="1" required value={understanding} onChange={(event) => { const value = event.target.value; if (value === "" || (/^\d{1,3}$/.test(value) && Number(value) <= 100)) setUnderstanding(value); }}/></label>
        <fieldset className="phase6-mode"><legend>How focused were you?</legend>
          {(["poor", "okay", "focused"] as const).map((value) => <button type="button" key={value} className={focus === value ? "is-active" : ""} onClick={() => setFocus(value)}>{value === "poor" ? "Poor" : value === "okay" ? "Okay" : "Focused"}</button>)}
        </fieldset>
        <button type="button" className="study-reflection-doubt-toggle" aria-expanded={showDoubt} onClick={() => setShowDoubt((value) => !value)}><Icon name="plus" size={15}/>{showDoubt ? "Hide doubt" : "Add an optional doubt"}</button>
        {showDoubt ? <><label><span>Any doubt? <small>Optional</small></span><textarea rows={2} maxLength={1200} value={doubt} onChange={(event) => setDoubt(event.target.value)} placeholder="Write the doubt from this session…"/></label>
        {doubt.trim() ? <fieldset className="phase6-mode"><legend>Where should this doubt go?</legend><button type="button" className={visibility === "private" ? "is-active" : ""} onClick={() => setVisibility("private")}>Keep private</button><button type="button" className={visibility === "community" ? "is-active" : ""} onClick={() => setVisibility("community")}>Ask Community</button></fieldset> : null}
        {doubt.trim() && visibility === "community" ? <div className="phase6-note"><Icon name="community"/><span>CA Progress will use this session’s subject and chapter to choose the Community doubts room automatically. You do not need to reselect a category.</span></div> : null}</> : null}
        {error ? <div className="phase6-inline-error" role="alert">{error}</div> : null}
        <div className="button-row"><button type="submit" className="ui-button ui-button--primary" disabled={busy || understanding === "" || !focus}>{busy ? "Saving…" : "Save reflection"}</button><button type="button" className="ui-button ui-button--ghost" onClick={() => setLater(true)}>Later</button></div>
      </form>
    </CardBody>
  </Card>;
}
