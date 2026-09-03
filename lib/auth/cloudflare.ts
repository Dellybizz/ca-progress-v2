import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { getServerRuntimeValue } from "@/lib/cloudflare/runtime-env";
import type { AppRole } from "@/lib/authorization/roles";
import type { SupportedOAuthProvider } from "./provider";

const SESSION_COOKIE = "ca_session";
export const GUEST_TEST_COOKIE = "ca_guest_test_id";
const OAUTH_TRANSACTION_COOKIE = "ca_oauth_tx";
const OAUTH_TRANSACTION_MAX_AGE_SECONDS = 10 * 60;
const NORMAL_SESSION_SECONDS = 12 * 60 * 60;
const REMEMBER_SESSION_SECONDS = 30 * 24 * 60 * 60;
const NORMAL_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60;
const REMEMBER_ABSOLUTE_SECONDS = 45 * 24 * 60 * 60;
const VALID_ROLES = new Set<AppRole>(["student", "moderator", "admin", "owner", "parent_owner"]);

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
type D1Database = {
  prepare(query: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
};

type OAuthTransaction = {
  provider: SupportedOAuthProvider;
  state: string;
  verifier: string;
  redirectUri: string;
  next: string;
  remember: boolean;
  expiresAt: number;
};

type ProviderProfile = {
  provider: SupportedOAuthProvider;
  providerUserId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
};

type IdentityRow = {
  identity_id: string;
  application_user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type SessionRow = {
  session_id: string;
  application_user_id: string;
  auth_identity_id: string | null;
  remember_device: number;
  expires_at: string;
  absolute_expires_at: string;
  role: string;
  account_state: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type CloudflareApplicationSession = {
  sessionId: string;
  applicationUserId: string;
  role: AppRole;
  entitlements: string[];
  email: string | null;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  rememberDevice: boolean;
  expiresAt: string;
  absoluteExpiresAt: string;
};

export type CloudflareOAuthCallbackResult = {
  next: string;
  remember: boolean;
  applicationUserId: string;
};

function getDb(): D1Database {
  const { env } = getCloudflareContext();
  const db = (env as unknown as Record<string, unknown>).DB as D1Database | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new Error("Cloudflare D1 DB binding is required for Worker authentication.");
  }
  return db;
}

export function isCloudflareAuthRuntime() {
  return getServerRuntimeValue("CA_AUTH_RUNTIME").toLowerCase() === "cloudflare";
}

function requiredSecret(name: string, ...fallbackNames: string[]) {
  for (const key of [name, ...fallbackNames]) {
    const value = getServerRuntimeValue(key);
    if (value) return value;
  }
  throw new Error(`${name} is required for Cloudflare authentication.`);
}

function secureCookie() {
  return process.env.NODE_ENV === "production" || getServerRuntimeValue("NEXT_PUBLIC_APP_ENV") === "production";
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeJson(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function digestBytes(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function sha256Base64Url(value: string) {
  return bytesToBase64Url(await digestBytes(value));
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredSecret("CA_AUTH_SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function verifySignedValue(value: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredSecret("CA_AUTH_SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    return await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(value));
  } catch {
    return false;
  }
}

function sanitizedNextFromRedirect(redirectTo: string) {
  const url = new URL(redirectTo);
  const requested = url.searchParams.get("next") || "/dashboard";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
}

function callbackUriFromRedirect(redirectTo: string) {
  const url = new URL(redirectTo);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function oauthConfig(provider: SupportedOAuthProvider) {
  if (provider === "google") {
    return {
      clientId: requiredSecret("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"),
      clientSecret: requiredSecret("GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"),
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      scope: "openid email profile",
    };
  }
  return {
    clientId: requiredSecret("LINKEDIN_OIDC_CLIENT_ID", "LINKEDIN_CLIENT_ID"),
    clientSecret: requiredSecret("LINKEDIN_OIDC_CLIENT_SECRET", "LINKEDIN_CLIENT_SECRET"),
    authorizationEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
    tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoEndpoint: "https://api.linkedin.com/v2/userinfo",
    scope: "openid profile email",
  };
}

export async function startCloudflareOAuth(provider: SupportedOAuthProvider, redirectTo: string) {
  const config = oauthConfig(provider);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = callbackUriFromRedirect(redirectTo);
  const source = new URL(redirectTo);
  const transaction: OAuthTransaction = {
    provider,
    state,
    verifier,
    redirectUri,
    next: sanitizedNextFromRedirect(redirectTo),
    remember: source.searchParams.get("remember") !== "false",
    expiresAt: Date.now() + OAUTH_TRANSACTION_MAX_AGE_SECONDS * 1000,
  };
  const payload = encodeJson(transaction);
  const signature = await sign(payload);
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_TRANSACTION_COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: OAUTH_TRANSACTION_MAX_AGE_SECONDS,
  });

  const authorization = new URL(config.authorizationEndpoint);
  authorization.searchParams.set("client_id", config.clientId);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", config.scope);
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  return authorization.toString();
}

async function readOAuthTransaction(expectedState: string) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_TRANSACTION_COOKIE)?.value || "";
  cookieStore.set(OAUTH_TRANSACTION_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: 0,
  });
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !(await verifySignedValue(payload, signature))) throw new Error("Invalid OAuth transaction cookie.");
  const transaction = decodeJson<OAuthTransaction>(payload);
  if (transaction.expiresAt < Date.now()) throw new Error("OAuth transaction expired.");
  if (!expectedState || transaction.state !== expectedState) throw new Error("OAuth state validation failed.");
  if (transaction.provider !== "google" && transaction.provider !== "linkedin_oidc") throw new Error("Unsupported OAuth provider.");
  return transaction;
}

async function exchangeCode(transaction: OAuthTransaction, code: string) {
  const config = oauthConfig(transaction.provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: transaction.redirectUri,
    code_verifier: transaction.verifier,
  });
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  if (!response.ok) throw new Error(`OAuth token exchange failed (${response.status}).`);
  const token = await response.json() as { access_token?: unknown };
  if (typeof token.access_token !== "string" || !token.access_token) throw new Error("OAuth provider did not return an access token.");
  return { accessToken: token.access_token, config };
}

async function loadProviderProfile(provider: SupportedOAuthProvider, accessToken: string, userInfoEndpoint: string): Promise<ProviderProfile> {
  const response = await fetch(userInfoEndpoint, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`OAuth userinfo request failed (${response.status}).`);
  const data = await response.json() as Record<string, unknown>;
  const subject = typeof data.sub === "string" ? data.sub.trim() : "";
  if (!subject) throw new Error("OAuth userinfo response has no stable subject.");
  const email = typeof data.email === "string" ? data.email.trim() || null : null;
  const displayName = typeof data.name === "string" ? data.name.trim() || null : null;
  const avatarUrl = typeof data.picture === "string" ? data.picture.trim() || null : null;
  return {
    provider,
    providerUserId: subject,
    email,
    phone: null,
    displayName,
    avatarUrl,
    emailVerified: data.email_verified === true,
  };
}

async function resolveApplicationIdentity(profile: ProviderProfile) {
  const db = getDb();
  const existing = await db.prepare(
    "SELECT identity_id,application_user_id,email,phone,display_name,avatar_url FROM auth_identities WHERE provider=?1 AND provider_user_id=?2 LIMIT 1",
  ).bind(profile.provider, profile.providerUserId).first<IdentityRow>();
  const migrated = profile.email
    ? await db.prepare(
      "SELECT identity_id,application_user_id,email,phone,display_name,avatar_url FROM auth_identities WHERE provider='supabase_auth' AND lower(email)=lower(?1) LIMIT 2",
    ).bind(profile.email).all<IdentityRow>()
    : { results: [] };
  const migratedUsers = migrated.results || [];
  const canonicalUser = migratedUsers.length === 1 ? migratedUsers[0] : null;
  if (existing) {
    const applicationUserId = canonicalUser?.application_user_id || existing.application_user_id;
    await db.prepare(
      "UPDATE auth_identities SET application_user_id=?1,email=?2,phone=?3,display_name=?4,avatar_url=?5,email_verified=?6,last_seen_at=CURRENT_TIMESTAMP WHERE identity_id=?7",
    ).bind(applicationUserId, profile.email, profile.phone, profile.displayName, profile.avatarUrl, profile.emailVerified ? 1 : 0, existing.identity_id).run();
    return { identityId: existing.identity_id, applicationUserId, profile };
  }

  const applicationUserId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES(?1,'supabase',NULL,'active','student')").bind(applicationUserId),
    db.prepare("INSERT INTO auth_identities(identity_id,provider,provider_user_id,application_user_id,email,phone,display_name,avatar_url,email_verified) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)")
      .bind(identityId, profile.provider, profile.providerUserId, applicationUserId, profile.email, profile.phone, profile.displayName, profile.avatarUrl, profile.emailVerified ? 1 : 0),
  ]);
  return { identityId, applicationUserId, profile };
}

function isoAfter(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function issueSession(input: {
  applicationUserId: string;
  identityId: string | null;
  remember: boolean;
  rotatedFromSessionId?: string | null;
  absoluteExpiresAt?: string;
}) {
  const db = getDb();
  const rawToken = randomToken(32);
  const tokenHash = await sha256Base64Url(rawToken);
  const sessionId = crypto.randomUUID();
  const sessionSeconds = input.remember ? REMEMBER_SESSION_SECONDS : NORMAL_SESSION_SECONDS;
  const absoluteSeconds = input.remember ? REMEMBER_ABSOLUTE_SECONDS : NORMAL_ABSOLUTE_SECONDS;
  const requestedExpiry = Date.now() + sessionSeconds * 1000;
  const absoluteExpiresAt = input.absoluteExpiresAt || isoAfter(absoluteSeconds);
  const expiresAt = new Date(Math.min(requestedExpiry, new Date(absoluteExpiresAt).getTime())).toISOString();
  await db.prepare(
    "INSERT INTO sessions(session_id,application_user_id,auth_identity_id,token_hash,remember_device,expires_at,absolute_expires_at,rotated_from_session_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
  ).bind(sessionId, input.applicationUserId, input.identityId, tokenHash, input.remember ? 1 : 0, expiresAt, absoluteExpiresAt, input.rotatedFromSessionId || null).run();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  });
  return sessionId;
}

export async function exchangeCloudflareOAuthCode(code: string, state: string): Promise<CloudflareOAuthCallbackResult> {
  if (!code.trim()) throw new Error("OAuth code is required.");
  const transaction = await readOAuthTransaction(state);
  const { accessToken, config } = await exchangeCode(transaction, code);
  const profile = await loadProviderProfile(transaction.provider, accessToken, config.userInfoEndpoint);
  const identity = await resolveApplicationIdentity(profile);
  await issueSession({ applicationUserId: identity.applicationUserId, identityId: identity.identityId, remember: transaction.remember });
  return { next: transaction.next, remember: transaction.remember, applicationUserId: identity.applicationUserId };
}

async function currentSessionRow(rawToken: string) {
  const tokenHash = await sha256Base64Url(rawToken);
  return getDb().prepare(
    `SELECT s.session_id,s.application_user_id,s.auth_identity_id,s.remember_device,s.expires_at,s.absolute_expires_at,
            u.role,u.account_state,i.email,i.phone,i.display_name,i.avatar_url
       FROM sessions s
       JOIN app_users u ON u.user_id=s.application_user_id
       LEFT JOIN auth_identities i ON i.identity_id=s.auth_identity_id
      WHERE s.token_hash=?1 AND s.revoked_at IS NULL
        AND julianday(s.expires_at) > julianday(CURRENT_TIMESTAMP)
        AND julianday(s.absolute_expires_at) > julianday(CURRENT_TIMESTAMP)
      LIMIT 1`,
  ).bind(tokenHash).first<SessionRow>();
}

async function loadEntitlements(applicationUserId: string) {
  const result = await getDb().prepare(
    `SELECT DISTINCT pe.feature_key
       FROM user_subscriptions us
       JOIN plan_entitlements pe ON pe.plan_id=us.plan_id AND pe.enabled=1
      WHERE us.user_id=?1 AND us.status='active'
        AND julianday(us.starts_at) <= julianday(CURRENT_TIMESTAMP)
        AND (us.ends_at IS NULL OR julianday(us.ends_at) > julianday(CURRENT_TIMESTAMP))`,
  ).bind(applicationUserId).all<{ feature_key: string }>();
  return (result.results || []).map((row) => row.feature_key).filter(Boolean);
}

function guestTestEnabled() {
  return getServerRuntimeValue("CA_GUEST_TEST_MODE").trim().toLowerCase() === "true";
}

function guestTestId() {
  const value = (cookies()).then((store) => store.get(GUEST_TEST_COOKIE)?.value || "");
  return value;
}

async function ensureGuestTestUser(applicationUserId: string) {
  const database = getDb();
  const attempt = await database.prepare(
    "SELECT attempt_key FROM exam_attempts WHERE verification_status='verified' ORDER BY start_date DESC LIMIT 1",
  ).first<{ attempt_key: string }>();
  const attemptKey = attempt?.attempt_key || "undecided";
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES(?1,'guest-test',?1,'active','student')").bind(applicationUserId),
    database.prepare("INSERT OR IGNORE INTO profiles(user_id,display_name,ca_level,group_choice,attempt_key,daily_target_minutes,onboarding_step,onboarding_completed_at) VALUES(?1,'Guest Tester','intermediate','both',?2,120,4,CURRENT_TIMESTAMP)").bind(applicationUserId, attemptKey),
    database.prepare("INSERT OR IGNORE INTO user_preferences(user_id) VALUES(?1)").bind(applicationUserId),
  ]);
}

export async function isCurrentGuestTestUser(applicationUserId: string) {
  if (!guestTestEnabled()) return false;
  const store = await cookies();
  return store.get(GUEST_TEST_COOKIE)?.value === applicationUserId;
}

export async function getCloudflareApplicationSession(): Promise<CloudflareApplicationSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value || "";
  if (!rawToken && guestTestEnabled()) {
    const applicationUserId = cookieStore.get(GUEST_TEST_COOKIE)?.value || "";
    if (/^[0-9a-f-]{36}$/i.test(applicationUserId)) {
      await ensureGuestTestUser(applicationUserId);
      return { sessionId: applicationUserId, applicationUserId, role: "student", entitlements: [], email: null, phone: null, displayName: "Guest Tester", avatarUrl: null, rememberDevice: true, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
    }
  }
  if (!rawToken) return null;
  const row = await currentSessionRow(rawToken);
  if (!row || row.account_state !== "active") return null;
  const role = VALID_ROLES.has(row.role as AppRole) ? row.role as AppRole : "student";
  const entitlements = await loadEntitlements(row.application_user_id);
  await getDb().prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE session_id=?1").bind(row.session_id).run();
  return {
    sessionId: row.session_id,
    applicationUserId: row.application_user_id,
    role,
    entitlements,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    rememberDevice: row.remember_device === 1,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
  };
}

export async function rotateCloudflareSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value || "";
  if (!rawToken) throw new Error("No active session to rotate.");
  const row = await currentSessionRow(rawToken);
  if (!row || row.account_state !== "active") throw new Error("Session is expired or revoked.");
  const db = getDb();
  await db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE session_id=?1").bind(row.session_id).run().catch(async () => {
    // Phase 3 schema intentionally has no updated_at on sessions; keep compatibility
    // with a future additive column without weakening revocation.
    await db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE session_id=?1").bind(row.session_id).run();
  });
  return issueSession({
    applicationUserId: row.application_user_id,
    identityId: row.auth_identity_id,
    remember: row.remember_device === 1,
    rotatedFromSessionId: row.session_id,
    absoluteExpiresAt: row.absolute_expires_at,
  });
}

export async function signOutCloudflareSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value || "";
  if (rawToken) {
    const tokenHash = await sha256Base64Url(rawToken);
    await getDb().prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?1 AND revoked_at IS NULL").bind(tokenHash).run();
  }
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
