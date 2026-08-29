import "server-only";

import { getPublicRuntimeConfig } from "@/lib/env";

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

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
    context: redact(context),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
