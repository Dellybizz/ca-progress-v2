export const API_V1_DOMAINS = [
  "session", "dashboard", "progress", "chapters", "today", "planner",
  "focus", "notes", "resources", "community", "icai", "search",
  "profile", "settings", "notifications", "subscriptions", "offline",
] as const;

export type ApiV1Domain = (typeof API_V1_DOMAINS)[number];
export type ApiV1Error = {
  error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };
  meta?: { requestId: string; apiVersion: 1 };
};
export type ApiV1Page<T> = {
  items: T[];
  page: { nextCursor: string | null; hasMore: boolean; limit: number };
};
export type ApiV1Delta<T> = {
  items: T[];
  sync: { cursor: string | null; hasMore: boolean; deletedIds: string[] };
};

export const API_V1_CAPABILITIES = Object.freeze({
  apiVersion: 1 as const,
  transport: "cloudflare-workers" as const,
  sameOriginCookies: true,
  requestIdHeader: "X-Request-ID",
  idempotencyHeader: "Idempotency-Key",
  pagination: { cursorParameter: "cursor", limitParameter: "limit", maximumLimit: 100 },
  deltaSync: { cursorParameter: "syncCursor", contextHeader: "X-CA-Context-Version" },
  domains: API_V1_DOMAINS,
});

export function apiV1Path(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/api/v1${normalized}`;
}

export function apiV1MutationHeaders(idempotencyKey = crypto.randomUUID()) {
  return { "Content-Type": "application/json", "X-CA-API-Version": "1", "Idempotency-Key": idempotencyKey };
}
