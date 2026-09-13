import "server-only";

import { getPublicRuntimeConfig } from "@/lib/env";

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

export function errorFingerprint(error: unknown, fallback = "unknown-error") {
  const source = error instanceof Error ? `${error.name}:${error.message}` : String(error || fallback);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const sensitiveKey = /(authorization|cookie|password|secret|token|service.?role|api.?key)/i;

function redact(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  return value;
}

export function logEvent(level: LogLevel, event: string, context: LogContext = {}) {
  const runtime = getPublicRuntimeConfig();
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: "ca-progress-v2",
    environment: runtime.appEnv,
    event,
    context: redact({ ...context, ...(level === "error" && !("errorFingerprint" in context) ? { errorFingerprint: errorFingerprint(context.error) } : {}) }),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
