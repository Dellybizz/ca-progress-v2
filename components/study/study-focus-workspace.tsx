"use client";

import { useState } from "react";
import { focusReflectionPromptEnabled } from "@/components/preferences/focus-preferences";
import type { StudyPendingReflection, StudyReadyModel } from "@/lib/study/types";
import { StudyReflection } from "./study-reflection";
import { StudyTimer } from "./study-timer";

type PendingReview = { session: StudyPendingReflection; ready: boolean };

export function StudyFocusWorkspace({ model, initialSubjectId, initialChapterId, initialTaskId }: { model: StudyReadyModel; initialSubjectId?: string; initialChapterId?: string; initialTaskId?: string }) {
  const [review, setReview] = useState<PendingReview | null>(null);

  const closeReview = () => {
    setReview(null);
  };

  return <>
    <div id="study-timer"><StudyTimer model={model} initialSubjectId={initialSubjectId} initialChapterId={initialChapterId} initialTaskId={initialTaskId} onReviewChange={(next) => setReview(next && focusReflectionPromptEnabled() ? next : null)}/></div>
    {review ? <StudyReflection session={review.session} ready={review.ready} onClose={closeReview}/> : null}
  </>;
}
