import "server-only";

import { Buffer } from "node:buffer";
import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { issueRazorpayReviewerSession } from "./cloudflare";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
type D1Database = { prepare(query: string): D1Statement };

type ReviewerCredentialRow = {
  credential_id: string;
  application_user_id: string;
  username_normalized: string;
  password_salt: string;
  password_hash: string;
  password_iterations: number;
  active: number;
  expires_at: string;
  failed_attempts: number;
  locked_until: string | null;
};

function getDb(): D1Database {
  const { env } = getCloudflareContext();
  const db = (env as unknown as Record<string, unknown>).DB as D1Database | undefined;
  if (!db || typeof db.prepare !== "function") throw new Error("Cloudflare D1 DB binding is required for reviewer authentication.");
  return db;
}

function normalizeReviewerUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function reviewerPasswordHash(password: string, salt: string, iterations: number) {
  return pbkdf2Sync(password, Buffer.from(salt, "base64url"), iterations, 32, "sha256");
}

export class ReviewerAuthError extends Error {
  constructor(public readonly code: "store" | "crypto" | "credentials" | "session") {
    super("Reviewer authentication failed.");
  }
}

export async function signInRazorpayReviewer(input: { username: string; password: string; remember: boolean }) {
  const username = normalizeReviewerUsername(input.username);
  let db: D1Database;
  let row: ReviewerCredentialRow | null;
  try {
    db = getDb();
    row = await db.prepare(
      "SELECT credential_id,application_user_id,username_normalized,password_salt,password_hash,password_iterations,active,expires_at,failed_attempts,locked_until FROM reviewer_credentials WHERE username_normalized=?1 LIMIT 1",
    ).bind(username).first<ReviewerCredentialRow>();
  } catch {
    throw new ReviewerAuthError("store");
  }

  const dummySalt = "AAAAAAAAAAAAAAAAAAAAAA";
  const dummyHash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const salt = row?.password_salt || dummySalt;
  const iterations = row?.password_iterations || 310000;
  let passwordValid = false;
  try {
    const expected = Buffer.from(row?.password_hash || dummyHash, "base64url");
    const actual = reviewerPasswordHash(input.password, salt, iterations);
    passwordValid = actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    throw new ReviewerAuthError("crypto");
  }

  const now = Date.now();
  const locked = Boolean(row?.locked_until && Date.parse(row.locked_until) > now);
  const expired = !row || row.active !== 1 || Date.parse(row.expires_at) <= now;
  if (!row || !passwordValid || locked || expired) {
    if (row) {
      const nextAttempts = row.failed_attempts + 1;
      const lockUntil = nextAttempts >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null;
      await db.prepare(
        "UPDATE reviewer_credentials SET failed_attempts=?1,locked_until=COALESCE(?2,locked_until),updated_at=CURRENT_TIMESTAMP WHERE credential_id=?3",
      ).bind(nextAttempts, lockUntil, row.credential_id).run();
    }
    throw new ReviewerAuthError("credentials");
  }

  await db.prepare(
    "UPDATE reviewer_credentials SET failed_attempts=0,locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE credential_id=?1",
  ).bind(row.credential_id).run();

  try {
    await issueRazorpayReviewerSession(row.application_user_id, input.remember);
  } catch {
    throw new ReviewerAuthError("session");
  }
  return { applicationUserId: row.application_user_id };
}
