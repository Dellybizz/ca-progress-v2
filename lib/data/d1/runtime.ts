import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type HotD1Statement = {
  bind(...values: unknown[]): HotD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};
export type HotD1Database = {
  prepare(sql: string): HotD1Statement;
  batch<T = Record<string, unknown>>(statements: HotD1Statement[]): Promise<Array<{ results?: T[] }>>;
};

export function getHotD1Database(): HotD1Database {
  const { env } = getCloudflareContext();
  const db = (env as unknown as Record<string, unknown>).DB as HotD1Database | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") throw new Error("Cloudflare D1 DB binding is required.");
  return db;
}
