export type Phase9ForecastStatus = "insufficient_data" | "ahead" | "at_risk" | "behind" | "complete";

export type Phase9ForecastInput = {
  totalChapters: number;
  completedChapters: number;
  completionDates: Array<string | Date>;
  verifiedAttemptDate: string | Date | null;
  now?: string | Date;
};

export type Phase9ForecastResult = {
  eligible: boolean;
  status: Phase9ForecastStatus;
  reasons: string[];
  totalChapters: number;
  completedChapters: number;
  remainingChapters: number;
  completionPercent: number;
  observedChaptersPerWeek: number | null;
  requiredChaptersPerWeek: number | null;
  projectedCompletionDate: string | null;
  recommendedTargetDate: string | null;
  verifiedAttemptDate: string | null;
  observationDays: number;
  recentCompletionCount: number;
  distinctCompletionDays: number;
};

export const PHASE9_FORECAST_POLICY: Readonly<{
  lookbackDays: number;
  minimumRecentCompletions: number;
  minimumObservationDays: number;
  minimumDistinctCompletionDays: number;
  staleAfterDays: number;
  revisionBufferDays: number;
}>;

export function evaluateBaselineForecast(input: Phase9ForecastInput): Phase9ForecastResult;
