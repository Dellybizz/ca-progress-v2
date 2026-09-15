export type ProgressPdfRow = {
  chapterId?: string | null;
  chapterNumber?: string | null;
  chapterTitle?: string | null;
  subjectTitle?: string | null;
  levelTitle?: string | null;
  completedAt?: string | null;
  revision1At?: string | null;
  revision2At?: string | null;
  test1At?: string | null;
  test2At?: string | null;
};

export type ProgressPdfProfile = {
  displayName?: string | null;
  caLevel?: string | null;
  groupChoice?: string | null;
  attemptKey?: string | null;
};

export function buildProgressPdf(input?: { profile?: ProgressPdfProfile | null; rows?: ProgressPdfRow[] }): Uint8Array;
