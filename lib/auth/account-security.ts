import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCloudflareApplicationSession } from "./cloudflare";
import { createPasswordHash, normalizeAccountUsername, validAccountUsername, verifyPassword } from "./password";

export class AccountSecurityError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<{ meta?: { changes?: number } }> };
type Database = { prepare(sql: string): Statement };
const db = () => {
  const database = (getCloudflareContext().env as unknown as Record<string, unknown>).DB as Database | undefined;
  if (!database) throw new Error("Account database unavailable");
  return database;
};

export async function authenticatedPassword(currentPassword: string) {
  const session = await getCloudflareApplicationSession();
  if (!session) throw new AccountSecurityError("Sign in to manage account security.", 401);
  const database = db();
  // Throttle failed and successful checks alike to avoid password guessing through security actions.
  const scope = `security:${session.applicationUserId}`;
  const limit = await database.prepare(`INSERT INTO password_auth_limits(scope,attempts,expires_at) VALUES(?1,1,?2)
    ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN excluded.expires_at ELSE expires_at END RETURNING attempts`)
    .bind(scope, new Date(Date.now() + 15 * 60000).toISOString()).first<{ attempts: number }>();
  if (!limit || limit.attempts > 12) throw new AccountSecurityError("Too many attempts. Try again later.", 429);
  const credential = await database.prepare(`SELECT pc.salt,pc.password_hash,pc.iterations FROM password_credentials pc
    JOIN app_users u ON u.user_id=pc.user_id WHERE pc.user_id=?1 AND u.account_state='active'`)
    .bind(session.applicationUserId).first<{ salt: string; password_hash: string; iterations: number }>();
  if (!await verifyPassword(currentPassword, credential)) throw new AccountSecurityError("Current password is incorrect. If you have not set one, sign in with Google or LinkedIn and finish account setup.", 403);
  return { session, database, credential };
}

export async function changeAccountCredentials(input: { currentPassword: string; username?: string; newPassword?: string }) {
  const { session, database } = await authenticatedPassword(input.currentPassword);
  if ((input.username === undefined) === (input.newPassword === undefined)) throw new AccountSecurityError("Choose one account detail to change.", 400);
  if (input.username !== undefined) {
    const username = normalizeAccountUsername(input.username);
    if (!validAccountUsername(username)) throw new AccountSecurityError("Use a valid username of 3–30 characters.", 400);
    try {
      const result = await database.prepare(`UPDATE password_credentials SET username=?1 WHERE user_id=?2
        AND EXISTS(SELECT 1 FROM sessions s WHERE s.session_id=?3 AND s.application_user_id=password_credentials.user_id
        AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND s.absolute_expires_at>CURRENT_TIMESTAMP)`)
        .bind(username, session.applicationUserId, session.sessionId).run();
      if (result.meta?.changes !== 1) throw new AccountSecurityError("Sign in again to change your username.", 401);
    } catch (error) {
      if (/UNIQUE constraint failed/i.test(String(error))) throw new AccountSecurityError("This username is unavailable.", 409);
      throw error;
    }
    return { username, applicationUserId: session.applicationUserId };
  }
  const credential = await createPasswordHash(input.newPassword!);
  const result = await database.prepare(`UPDATE password_credentials SET salt=?1,password_hash=?2,iterations=?3 WHERE user_id=?4
    AND EXISTS(SELECT 1 FROM sessions s WHERE s.session_id=?5 AND s.application_user_id=password_credentials.user_id
    AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND s.absolute_expires_at>CURRENT_TIMESTAMP)`)
    .bind(credential.salt, credential.hash, credential.iterations, session.applicationUserId, session.sessionId).run();
  if (result.meta?.changes !== 1) throw new AccountSecurityError("Sign in again to change your password.", 401);
  // Existing sessions are no longer trusted after a password change, except this session.
  await database.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE application_user_id=?1 AND session_id<>?2 AND revoked_at IS NULL")
    .bind(session.applicationUserId, session.sessionId).run();
  return { passwordChanged: true, applicationUserId: session.applicationUserId };
}

export async function revokeAccountDevice(sessionId: string, currentPassword: string) {
  const { session, database } = await authenticatedPassword(currentPassword);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || sessionId === session.sessionId) throw new AccountSecurityError("Select another active device.", 400);
  const result = await database.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE session_id=?1 AND application_user_id=?2 AND session_id<>?3 AND revoked_at IS NULL")
    .bind(sessionId, session.applicationUserId, session.sessionId).run();
  if (result.meta?.changes !== 1) throw new AccountSecurityError("This device is already signed out or unavailable.", 404);
  return { revoked: true };
}
