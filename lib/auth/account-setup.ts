import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCloudflareApplicationSession } from "./cloudflare";
import { createPasswordHash, normalizeAccountUsername, validAccountUsername } from "./password";

export class AccountSetupError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<{ meta?: { changes?: number } }> };
type Database = { prepare(sql: string): Statement };
function database(): Database {
  const db = (getCloudflareContext().env as unknown as Record<string, unknown>).DB as Database | undefined;
  if (!db) throw new Error("Account database is unavailable");
  return db;
}

export type AccountSetupState = { eligible: boolean; username: string | null; isTemporary: boolean; hasPassword: boolean };
export async function getAccountSetupState(): Promise<AccountSetupState | null> {
  const session = await getCloudflareApplicationSession();
  if (!session) return null;
  const row = await database().prepare(`SELECT n.username,n.is_temporary,
       EXISTS(SELECT 1 FROM password_credentials pc WHERE pc.user_id=u.user_id) AS has_password,
       EXISTS(SELECT 1 FROM sessions s JOIN auth_identities i ON i.identity_id=s.auth_identity_id
          WHERE s.session_id=?2 AND s.application_user_id=u.user_id AND i.application_user_id=u.user_id AND s.revoked_at IS NULL
          AND i.provider IN ('google','linkedin_oidc')) AS verified_provider
       FROM app_users u JOIN account_usernames n ON n.user_id=u.user_id
       WHERE u.user_id=?1 AND u.account_state='active' AND u.auth_provider<>'guest-test'`)
    .bind(session.applicationUserId, session.sessionId)
    .first<{ username: string; is_temporary: number; has_password: number; verified_provider: number }>();
  if (!row) return { eligible: false, username: null, isTemporary: false, hasPassword: false };
  return { eligible: row.verified_provider === 1 && row.is_temporary === 1 && row.has_password === 0,
    username: row.username, isTemporary: row.is_temporary === 1, hasPassword: row.has_password === 1 };
}

export async function completeAccountSetup(usernameInput: string, password: string) {
  const session = await getCloudflareApplicationSession();
  const username = normalizeAccountUsername(usernameInput);
  if (!session) throw new AccountSetupError("Sign in with your linked Google or LinkedIn account first.", 401);
  if (!validAccountUsername(username)) throw new AccountSetupError("Use 3–30 letters, numbers, dots or underscores, starting with a letter.", 400);
  const state = await getAccountSetupState();
  if (!state?.eligible) throw new AccountSetupError("This account cannot use initial setup. Open Account & security instead.", 403);
  const credential = await createPasswordHash(password);
  try {
    // The Phase 1 trigger updates the same user's alias in this transaction.
    // Session and provider checks are repeated inside the write to close revocation races.
    const result = await database().prepare(`INSERT INTO password_credentials(user_id,username,salt,password_hash,iterations)
      SELECT u.user_id,?1,?2,?3,?4 FROM app_users u
      JOIN account_usernames n ON n.user_id=u.user_id
      JOIN sessions s ON s.application_user_id=u.user_id
      JOIN auth_identities i ON i.identity_id=s.auth_identity_id
      WHERE u.user_id=?5 AND s.session_id=?6 AND s.revoked_at IS NULL
        AND s.expires_at>CURRENT_TIMESTAMP AND s.absolute_expires_at>CURRENT_TIMESTAMP
        AND u.account_state='active' AND u.auth_provider<>'guest-test'
        AND i.application_user_id=u.user_id AND i.provider IN ('google','linkedin_oidc') AND n.is_temporary=1
        AND NOT EXISTS(SELECT 1 FROM password_credentials pc WHERE pc.user_id=u.user_id)`)
      .bind(username, credential.salt, credential.hash, credential.iterations, session.applicationUserId, session.sessionId).run();
    if (result.meta?.changes !== 1) throw new AccountSetupError("This sign-in is no longer eligible. Sign in again.", 403);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) throw new AccountSetupError("This username is unavailable. Choose another.", 409);
    throw error;
  }
  return { username, applicationUserId: session.applicationUserId };
}
