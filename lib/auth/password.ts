import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ensureCloudflareUserBootstrap } from "./cloudflare-profile";
import { issueSession } from "./cloudflare";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> };
const ITERATIONS = 310000;
const USERNAME = /^[a-z][a-z0-9._]{2,29}$/;
export const normalizeAccountUsername = (value: string) => value.trim().toLowerCase();
export const validAccountUsername = (value: string) => USERNAME.test(value);
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => new Uint8Array(value.match(/.{2}/g)?.map(part => parseInt(part, 16)) || []);

function db(): Database {
  const database = (getCloudflareContext().env as unknown as Record<string, unknown>).DB as Database | undefined;
  if (!database) throw new Error("D1 authentication database is unavailable.");
  return database;
}

async function passwordHash(password: string, salt: Uint8Array, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256)));
}

export async function createPasswordHash(password: string) {
  if (password.length < 12 || password.length > 128) throw new PasswordAuthError("INVALID_INPUT", "Use a password of 12–128 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: hex(salt), hash: await passwordHash(password, salt), iterations: ITERATIONS };
}

function equalHex(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export class PasswordAuthError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "USERNAME_TAKEN" | "INVALID_CREDENTIALS" | "RATE_LIMITED", message: string) { super(message); }
}

async function limited(request: Request, operation: "login" | "register", username: string) {
  const address = request.headers.get("cf-connecting-ip") || "unknown";
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(address))));
  const scopes = operation === "login" ? [[`login-ip:${digest}`, 25], [`login-user:${username}`, 8]] as const : [[`register-ip:${digest}`, 5]] as const;
  for (const [scope, maximum] of scopes) {
    const expiresAt = new Date(Date.now() + (operation === "login" ? 15 : 60) * 60000).toISOString();
    const row = await db().prepare(
      "INSERT INTO password_auth_limits(scope,attempts,expires_at) VALUES(?1,1,?2) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN excluded.expires_at ELSE expires_at END RETURNING attempts",
    ).bind(scope, expiresAt).first<{ attempts: number }>();
    if (!row || row.attempts > maximum) throw new PasswordAuthError("RATE_LIMITED", "Too many attempts. Try again later.");
  }
}

export async function passwordAccount(request: Request, input: { action: "register" | "login"; username: string; password: string; native: boolean; remember: boolean }) {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME.test(username) || typeof input.password !== "string" || input.password.length > 128 || (input.action === "register" && input.password.length < 12)) {
    throw new PasswordAuthError("INVALID_INPUT", "Use a 3–30 character username starting with a letter and a password of at least 12 characters.");
  }
  await limited(request, input.action, username);
  const database = db();
  let userId: string;
  if (input.action === "register") {
    const existing = await database.prepare("SELECT user_id FROM password_credentials WHERE username=?1 LIMIT 1").bind(username).first();
    if (existing) throw new PasswordAuthError("USERNAME_TAKEN", "This username is unavailable.");
    userId = crypto.randomUUID();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await passwordHash(input.password, salt);
    try {
      await database.batch([
        database.prepare("INSERT INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES(?1,'password',?2,'active','student')").bind(userId, username),
        database.prepare("INSERT INTO password_credentials(user_id,username,salt,password_hash,iterations) VALUES(?1,?2,?3,?4,?5)").bind(userId, username, hex(salt), hash, ITERATIONS),
      ]);
    } catch (error) {
      if (/UNIQUE constraint failed/i.test(String(error))) throw new PasswordAuthError("USERNAME_TAKEN", "This username is unavailable.");
      throw error;
    }
    await ensureCloudflareUserBootstrap({ applicationUserId: userId, displayName: username, avatarUrl: null });
  } else {
    const credential = await database.prepare("SELECT pc.user_id,pc.salt,pc.password_hash,pc.iterations FROM password_credentials pc JOIN app_users u ON u.user_id=pc.user_id WHERE pc.username=?1 AND u.account_state='active' LIMIT 1").bind(username).first<{ user_id: string; salt: string; password_hash: string; iterations: number }>();
    const salt = credential?.salt && /^[0-9a-f]{32}$/.test(credential.salt) ? fromHex(credential.salt) : new Uint8Array(16);
    const hash = await passwordHash(input.password, salt, credential?.iterations || ITERATIONS);
    if (!credential || !equalHex(hash, credential.password_hash)) throw new PasswordAuthError("INVALID_CREDENTIALS", "Username or password is incorrect.");
    userId = credential.user_id;
  }
  const session = await issueSession({ applicationUserId: userId, identityId: null, remember: input.remember, clientKind: input.native ? "mobile" : "web", deviceLabel: input.native ? "CA Progress phone" : null, setCookie: !input.native });
  return input.native ? { authenticated: true, applicationUserId: userId, accessToken: session.rawToken, expiresAt: session.expiresAt } : { authenticated: true, applicationUserId: userId };
}
