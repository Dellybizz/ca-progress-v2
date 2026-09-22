import "server-only";

import { cache } from "react";
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
  clientKind: "web" | "mobile";
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
  last_seen_at: string | null;
  role: string;
  entitlements: string;
  account_state: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  client_kind?: "web" | "mobile" | null;
  device_label?: string | null;
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
  clientKind: "web" | "mobile";
  deviceLabel: string | null;
};

export type CloudflareOAuthCallbackResult = {
  next: string;
  remember: boolean;
  applicationUserId: string;
  clientKind: "web" | "mobile";
};

function getDb(): D1Database {
  const { env } = getCloudflareContext();
  const db = (env as unknown as Record<string, unknown>).DB as D1Database | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new Error("Cloudflare D1 DB binding is required for Worker authentication.");
  }
  return db;
}

function isMobileSessionSchemaUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such (?:column|table)/i.test(message)
    && /(?:client_kind|device_label|last_rotated_at|auth_session_events)/i.test(message);
}

async function writeOptionalSessionEvent(statement: D1Statement) {
  try {
    await statement.run();
  } catch (error) {
    if (!isMobileSessionSchemaUnavailable(error)) throw error;
  }
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
    clientKind: source.searchParams.get("client") === "mobile" ? "mobile" : "web",
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
  const matched = profile.email && profile.emailVerified
    ? await db.prepare(
      "SELECT identity_id,application_user_id,email,phone,display_name,avatar_url FROM auth_identities WHERE email_verified=1 AND lower(email)=lower(?1) GROUP BY application_user_id LIMIT 2",
    ).bind(profile.email).all<IdentityRow>()
    : { results: [] };
  const matchedUsers = matched.results || [];
  const canonicalUser = matchedUsers.length === 1 ? matchedUsers[0] : null;
  if (existing) {
    const applicationUserId = canonicalUser?.application_user_id || existing.application_user_id;
    await db.prepare(
      "UPDATE auth_identities SET application_user_id=?1,email=?2,phone=?3,display_name=?4,avatar_url=?5,email_verified=?6,last_seen_at=CURRENT_TIMESTAMP WHERE identity_id=?7",
    ).bind(applicationUserId, profile.email, profile.phone, profile.displayName, profile.avatarUrl, profile.emailVerified ? 1 : 0, existing.identity_id).run();
    return { identityId: existing.identity_id, applicationUserId, profile };
  }

  if (matchedUsers.length > 1) throw new Error("This verified email belongs to multiple legacy identities and requires account review.");
  const applicationUserId = canonicalUser?.application_user_id || crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const statements = [];
  if (!canonicalUser) statements.push(db.prepare("INSERT INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES(?1,'cloudflare_oauth',NULL,'active','student')").bind(applicationUserId));
  statements.push(db.prepare("INSERT INTO auth_identities(identity_id,provider,provider_user_id,application_user_id,email,phone,display_name,avatar_url,email_verified) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)")
    .bind(identityId, profile.provider, profile.providerUserId, applicationUserId, profile.email, profile.phone, profile.displayName, profile.avatarUrl, profile.emailVerified ? 1 : 0));
  await db.batch(statements);
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
  clientKind?: "web" | "mobile";
  deviceLabel?: string | null;
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
  try {
    await db.batch([
      db.prepare("INSERT INTO sessions(session_id,application_user_id,auth_identity_id,token_hash,remember_device,expires_at,absolute_expires_at,rotated_from_session_id,client_kind,device_label,last_rotated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,CURRENT_TIMESTAMP)")
        .bind(sessionId, input.applicationUserId, input.identityId, tokenHash, input.remember ? 1 : 0, expiresAt, absoluteExpiresAt, input.rotatedFromSessionId || null, input.clientKind || "web", input.deviceLabel || null),
      db.prepare("INSERT INTO auth_session_events(id,session_id,application_user_id,event_type,detail_json) VALUES(?1,?2,?3,?4,?5)")
        .bind(crypto.randomUUID(), sessionId, input.applicationUserId, input.rotatedFromSessionId ? "rotated" : "issued", JSON.stringify({ clientKind: input.clientKind || "web", rotatedFrom: input.rotatedFromSessionId || null })),
    ]);
  } catch (error) {
    if (!isMobileSessionSchemaUnavailable(error)) throw error;
    await db.prepare("INSERT INTO sessions(session_id,application_user_id,auth_identity_id,token_hash,remember_device,expires_at,absolute_expires_at,rotated_from_session_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)")
      .bind(sessionId, input.applicationUserId, input.identityId, tokenHash, input.remember ? 1 : 0, expiresAt, absoluteExpiresAt, input.rotatedFromSessionId || null).run();
  }
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
  await issueSession({ applicationUserId: identity.applicationUserId, identityId: identity.identityId, remember: transaction.remember, clientKind: transaction.clientKind });
  return { next: transaction.next, remember: transaction.remember, applicationUserId: identity.applicationUserId, clientKind: transaction.clientKind };
}

async function currentSessionRow(rawToken: string) {
  const tokenHash = await sha256Base64Url(rawToken);
  const db = getDb();
  const selectMobileSession = () => db.prepare(
    `SELECT s.session_id,s.application_user_id,s.auth_identity_id,s.remember_device,s.expires_at,s.absolute_expires_at,s.last_seen_at,s.client_kind,s.device_label,
            u.role,u.account_state,i.email,i.phone,i.display_name,i.avatar_url,
            COALESCE((
              SELECT group_concat(pe.feature_key)
                FROM user_subscriptions us
                JOIN plan_entitlements pe ON pe.plan_id=us.plan_id
               WHERE us.user_id=s.application_user_id
                 AND us.status='active'
                 AND us.starts_at <= CURRENT_TIMESTAMP
                 AND (us.ends_at IS NULL OR us.ends_at > CURRENT_TIMESTAMP)
                 AND pe.enabled=1
            ), '') AS entitlements
       FROM sessions s
       JOIN app_users u ON u.user_id=s.application_user_id
       LEFT JOIN auth_identities i ON i.identity_id=s.auth_identity_id
      WHERE s.token_hash=?1 AND s.revoked_at IS NULL
        AND s.expires_at > CURRENT_TIMESTAMP
        AND s.absolute_expires_at > CURRENT_TIMESTAMP
      LIMIT 1`,
  ).bind(tokenHash).first<SessionRow>();
  try {
    return await selectMobileSession();
  } catch (error) {
    if (!isMobileSessionSchemaUnavailable(error)) throw error;
    return db.prepare(
      `SELECT s.session_id,s.application_user_id,s.auth_identity_id,s.remember_device,s.expires_at,s.absolute_expires_at,s.last_seen_at,
              u.role,u.account_state,i.email,i.phone,i.display_name,i.avatar_url,
              COALESCE((
                SELECT group_concat(pe.feature_key)
                  FROM user_subscriptions us
                  JOIN plan_entitlements pe ON pe.plan_id=us.plan_id
                 WHERE us.user_id=s.application_user_id
                   AND us.status='active'
                   AND us.starts_at <= CURRENT_TIMESTAMP
                   AND (us.ends_at IS NULL OR us.ends_at > CURRENT_TIMESTAMP)
                   AND pe.enabled=1
              ), '') AS entitlements
         FROM sessions s
         JOIN app_users u ON u.user_id=s.application_user_id
         LEFT JOIN auth_identities i ON i.identity_id=s.auth_identity_id
        WHERE s.token_hash=?1 AND s.revoked_at IS NULL
          AND s.expires_at > CURRENT_TIMESTAMP
          AND s.absolute_expires_at > CURRENT_TIMESTAMP
        LIMIT 1`,
    ).bind(tokenHash).first<SessionRow>();
  }
}

function guestTestEnabled() {
  return getServerRuntimeValue("CA_GUEST_TEST_MODE").trim().toLowerCase() === "true";
}

async function ensureGuestTestUser(applicationUserId: string) {
  const database = getDb();
  const existing = await database.prepare("SELECT auth_provider FROM app_users WHERE user_id=?1 LIMIT 1").bind(applicationUserId).first<{ auth_provider: string }>();
  if (existing && existing.auth_provider !== "guest-test") return false;
  // The proxy-issued guest ID is stable per browser. Once bootstrapped, do not
  // repeat the attempt lookup and INSERT OR IGNORE batch on every page request.
  if (existing?.auth_provider === "guest-test") return true;
  const attempt = await database.prepare(
    "SELECT attempt_key FROM exam_attempts WHERE verification_status='verified' ORDER BY start_date DESC LIMIT 1",
  ).first<{ attempt_key: string }>();
  const attemptKey = attempt?.attempt_key || "undecided";
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES(?1,'guest-test',?1,'active','student')").bind(applicationUserId),
    database.prepare("INSERT OR IGNORE INTO profiles(user_id,display_name,ca_level,group_choice,attempt_key,daily_target_minutes,onboarding_step,onboarding_completed_at) VALUES(?1,'Guest Tester','intermediate','both',?2,120,4,CURRENT_TIMESTAMP)").bind(applicationUserId, attemptKey),
    database.prepare("INSERT OR IGNORE INTO user_preferences(user_id) VALUES(?1)").bind(applicationUserId),
  ]);
  return true;
}

export async function isCurrentGuestTestUser(applicationUserId: string) {
  if (!guestTestEnabled()) return false;
  const store = await cookies();
  return store.get(GUEST_TEST_COOKIE)?.value === applicationUserId;
}

async function readCloudflareApplicationSession(): Promise<CloudflareApplicationSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value || "";
  if (!rawToken && guestTestEnabled()) {
    const applicationUserId = cookieStore.get(GUEST_TEST_COOKIE)?.value || "";
    if (/^[0-9a-f-]{36}$/i.test(applicationUserId)) {
      if (!(await ensureGuestTestUser(applicationUserId))) return null;
      return { sessionId: applicationUserId, applicationUserId, role: "student", entitlements: [], email: null, phone: null, displayName: "Guest Tester", avatarUrl: null, rememberDevice: true, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), clientKind: "web", deviceLabel: "Guest test browser" };
    }
  }
  if (!rawToken) return null;
  const row = await currentSessionRow(rawToken);
  if (!row || row.account_state !== "active") return null;
  const role = VALID_ROLES.has(row.role as AppRole) ? row.role as AppRole : "student";
  const lastSeenAt = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  if (!lastSeenAt || Date.now() - lastSeenAt > 5 * 60 * 1000) {
    await getDb().prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE session_id=?1").bind(row.session_id).run();
  }
  return {
    sessionId: row.session_id,
    applicationUserId: row.application_user_id,
    role,
    entitlements: row.entitlements ? row.entitlements.split(",").filter(Boolean) : [],
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    rememberDevice: row.remember_device === 1,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    clientKind: row.client_kind === "mobile" ? "mobile" : "web",
    deviceLabel: row.device_label || null,
  };
}

export const getCloudflareApplicationSession = cache(readCloudflareApplicationSession);

export type CloudflareRequestAuth = {
  session: CloudflareApplicationSession | null;
  applicationUserId: string | null;
  role: AppRole;
  entitlements: string[];
  authenticated: boolean;
};

export const getCloudflareRequestAuth = cache(async (): Promise<CloudflareRequestAuth> => {
  const session = await getCloudflareApplicationSession();
  return {
    session,
    applicationUserId: session?.applicationUserId ?? null,
    role: session?.role ?? "student",
    entitlements: session?.entitlements ?? [],
    authenticated: Boolean(session),
  };
});

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
    clientKind: row.client_kind === "mobile" ? "mobile" : "web",
    deviceLabel: row.device_label || null,
  });
}

export type SessionDevice = { sessionId: string; current: boolean; clientKind: "web" | "mobile"; deviceLabel: string | null; lastSeenAt: string | null; expiresAt: string; createdAt: string };

export async function listCloudflareSessions(): Promise<SessionDevice[]> {
  const current = await getCloudflareApplicationSession();
  if (!current) return [];
  const db = getDb();
  let rows: D1Result<{ session_id:string; client_kind?:string|null; device_label?:string|null; last_seen_at:string|null; expires_at:string; created_at:string }>;
  try {
    rows = await db.prepare("SELECT session_id,client_kind,device_label,last_seen_at,expires_at,created_at FROM sessions WHERE application_user_id=?1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND absolute_expires_at>CURRENT_TIMESTAMP ORDER BY last_seen_at DESC LIMIT 25")
      .bind(current.applicationUserId).all();
  } catch (error) {
    if (!isMobileSessionSchemaUnavailable(error)) throw error;
    rows = await db.prepare("SELECT session_id,last_seen_at,expires_at,created_at FROM sessions WHERE application_user_id=?1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND absolute_expires_at>CURRENT_TIMESTAMP ORDER BY last_seen_at DESC LIMIT 25")
      .bind(current.applicationUserId).all();
  }
  return (rows.results || []).map(row => ({ sessionId: row.session_id, current: row.session_id === current.sessionId, clientKind: row.client_kind === "mobile" ? "mobile" : "web", deviceLabel: row.device_label || null, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, createdAt: row.created_at }));
}

export async function revokeOtherCloudflareSessions() {
  const current = await getCloudflareApplicationSession();
  if (!current) throw new Error("Authentication required.");
  const db = getDb();
  await db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE application_user_id=?1 AND session_id<>?2 AND revoked_at IS NULL").bind(current.applicationUserId, current.sessionId).run();
  await writeOptionalSessionEvent(db.prepare("INSERT INTO auth_session_events(id,session_id,application_user_id,event_type,detail_json) VALUES(?1,?2,?3,'revoked_others','{}')").bind(crypto.randomUUID(), current.sessionId, current.applicationUserId));
}

export async function signOutAllCloudflareSessions() {
  const current = await getCloudflareApplicationSession();
  if (!current) throw new Error("Authentication required.");
  const db = getDb();
  await db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE application_user_id=?1 AND revoked_at IS NULL").bind(current.applicationUserId).run();
  await writeOptionalSessionEvent(db.prepare("INSERT INTO auth_session_events(id,session_id,application_user_id,event_type,detail_json) VALUES(?1,?2,?3,'revoked_all','{}')").bind(crypto.randomUUID(), current.sessionId, current.applicationUserId));
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", maxAge: 0 });
}

export async function signOutCloudflareSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value || "";
  if (rawToken) {
    const tokenHash = await sha256Base64Url(rawToken);
    const db = getDb();
    const row = await db.prepare("SELECT session_id,application_user_id FROM sessions WHERE token_hash=?1 AND revoked_at IS NULL LIMIT 1").bind(tokenHash).first<{session_id:string;application_user_id:string}>();
    if (row) {
      await db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE session_id=?1 AND revoked_at IS NULL").bind(row.session_id).run();
      await writeOptionalSessionEvent(db.prepare("INSERT INTO auth_session_events(id,session_id,application_user_id,event_type,detail_json) VALUES(?1,?2,?3,'revoked','{}')").bind(crypto.randomUUID(), row.session_id, row.application_user_id));
    }
  }
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
