import { apiV1MutationHeaders, apiV1Path, type ApiV1Error } from "./api-v1";

export class ApiV1RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    readonly requestId: string | null,
  ) { super(message); this.name = "ApiV1RequestError"; }
}

export async function apiV1Fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers = new Headers(init.headers);
  headers.set("X-CA-API-Version", "1");
  if (mutation) {
    for (const [name, value] of Object.entries(apiV1MutationHeaders(headers.get("Idempotency-Key") || crypto.randomUUID()))) {
      if (!headers.has(name)) headers.set(name, value);
    }
  }
  const response = await fetch(apiV1Path(path), { ...init, headers, credentials: init.credentials ?? "same-origin" });
  const requestId = response.headers.get("X-Request-ID");
  if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
  const payload = await response.json().catch(() => null) as ApiV1Error | { error?: string; code?: string } | null;
  const typed = payload && typeof payload.error === "object" ? payload.error : null;
  const message = typed?.message || (payload && typeof payload.error === "string" ? payload.error : "Request failed.");
  const code = typed?.code || (payload && "code" in payload && typeof payload.code === "string" ? payload.code : `HTTP_${response.status}`);
  throw new ApiV1RequestError(message, response.status, code, typed?.retryable ?? response.status >= 500, requestId);
}
