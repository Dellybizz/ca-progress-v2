import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
export type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
export type D1DatabaseLike = {
  prepare(query: string): D1StatementLike;
  batch<T = Record<string, unknown>>(statements: D1StatementLike[]): Promise<D1Result<T>[]>;
};

export function getD1RuntimeDatabase(): D1DatabaseLike {
  const { env } = getCloudflareContext();
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new Error("Cloudflare D1 DB binding is required for ICAI review operations.");
  }
  return db;
}
