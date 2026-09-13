export type ScopedDataStatus = "loading" | "ready" | "empty" | "stale" | "error";

export type ScopedDataState<T> = {
  status: ScopedDataStatus;
  contextKey: string;
  data: T | null;
  resolvedAt: string | null;
  staleAt: string | null;
  message: string | null;
};

export function readyScopedData<T>(contextKey: string, data: T, resolvedAt = new Date()): ScopedDataState<T> {
  return {
    status: Array.isArray(data) && data.length === 0 ? "empty" : "ready",
    contextKey,
    data,
    resolvedAt: resolvedAt.toISOString(),
    staleAt: null,
    message: null,
  };
}
