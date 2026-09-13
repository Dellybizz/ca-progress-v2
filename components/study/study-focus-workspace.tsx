"use client";

import { useEffect, useState } from "react";
import type { StudyPendingReflection, StudyReadyModel } from "@/lib/study/types";
import { StudyReflection } from "./study-reflection";
import { StudyTimer } from "./study-timer";

type PendingReview = { session: StudyPendingReflection; ready: boolean };

export function StudyFocusWorkspace({ model, initialSubjectId, initialChapterId, initialTaskId }: { model: StudyReadyModel; initialSubjectId?: string; initialChapterId?: string; initialTaskId?: string }) {
  const [review, setReview] = useState<PendingReview | null>(() => model.pendingReflection ? { session: model.pendingReflection, ready: true } : null);
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!review && model.pendingReflection && model.pendingReflection.sessionId !== dismissedSessionId) setReview({ session: model.pendingReflection, ready: true });
  }, [dismissedSessionId, model.pendingReflection, review]);

  const closeReview = () => {
    setDismissedSessionId(review?.session.sessionId ?? null);
    setReview(null);
  };

  return <>
    <div id="study-timer"><StudyTimer model={model} initialSubjectId={initialSubjectId} initialChapterId={initialChapterId} initialTaskId={initialTaskId} onReviewChange={(next) => { if (next) setDismissedSessionId(null); setReview(next); }}/></div>
    {review ? <StudyReflection session={review.session} ready={review.ready} onClose={closeReview}/> : null}
  </>;
}
