import { AsyncLocalStorage } from "node:async_hooks";
import type { D1DatabaseLike } from "@/lib/data/d1/client";

// Only the authenticated offline endpoint installs this request-local boundary.
export const offlineTransaction = new AsyncLocalStorage<{
  db: D1DatabaseLike;
  afterCommit: Array<() => Promise<void>>;
  occurredAt?: string;
  timerPlanItemId?: string;
}>();
