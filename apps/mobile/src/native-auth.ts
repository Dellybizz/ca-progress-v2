import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { MOBILE_BUILD } from "./build";
import { openExternalSafely } from "./runtime";

const API_ORIGIN = "https://ca-progress-v2.habeebaasif622.workers.dev";
const SecureSession = registerPlugin<{ set(input: { key: "session" | "pkce"; value: string }): Promise<void>; get(input: { key: "session" | "pkce" }): Promise<{ value: string | null }>; remove(input: { key: "session" | "pkce" }): Promise<void> }>("SecureSession");
const browserMemory: Record<string, string | undefined> = {};

type StoredSession = { token: string; accountId: string };
function decodeSession(value: string | null): { token: string; accountId: string | null } | null {
  if (!value) return null;
  try { const parsed = JSON.parse(value) as Partial<StoredSession>; if (typeof parsed.token === "string" && typeof parsed.accountId === "string") return { token: parsed.token, accountId: parsed.accountId }; } catch { /* Legacy debug builds stored only the token. */ }
  return { token: value, accountId: null };
}
export async function readOfflineSessionAccountId() { return decodeSession(await secureGet("session"))?.accountId ?? null; }
export class NativeRequestError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = "NativeRequestError"; } }

export type NativeSessionSnapshot = { authenticated: boolean; user?: { applicationUserId?: string; displayName?: string | null; email?: string | null; avatarUrl?: string | null }; session?: { rotateRecommended?: boolean } };

async function secureSet(key: "session" | "pkce", value: string) { if (Capacitor.isNativePlatform()) await SecureSession.set({ key, value }); else browserMemory[key] = value; }
async function secureGet(key: "session" | "pkce") { return Capacitor.isNativePlatform() ? (await SecureSession.get({ key })).value : browserMemory[key] || null; }
async function secureRemove(key: "session" | "pkce") { if (Capacitor.isNativePlatform()) await SecureSession.remove({ key }); else delete browserMemory[key]; }
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function jsonRequest(path: string, init: RequestInit = {}, authenticated = false) {
  const token = authenticated ? decodeSession(await secureGet("session"))?.token : null;
  const response = await fetch(`${API_ORIGIN}${path}`, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", "X-CA-API-Version": String(MOBILE_BUILD.apiVersion), "X-CA-App-Build": String(MOBILE_BUILD.build), "X-CA-Native-App": MOBILE_BUILD.applicationId, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new NativeRequestError(body?.error?.message || "The request could not be completed.", response.status, body?.error?.code || "REQUEST_FAILED");
  return body;
}
export async function nativeApiRequest(path:string,init:RequestInit={}){
  if(!Capacitor.isNativePlatform())return jsonRequest(path,init,true);
  const token=decodeSession(await secureGet("session"))?.token;
  if(!token)throw new NativeRequestError("Sign in again to synchronize this device.",401,"SESSION_MISSING");
  const headers=new Headers(init.headers);
  headers.set("Content-Type","application/json");
  headers.set("X-CA-API-Version",String(MOBILE_BUILD.apiVersion));
  headers.set("X-CA-App-Build",String(MOBILE_BUILD.build));
  headers.set("X-CA-Native-App",MOBILE_BUILD.applicationId);
  headers.set("Authorization",`Bearer ${token}`);
  let response;
  try{
    response=await CapacitorHttp.request({
      url:`${API_ORIGIN}${path}`,
      method:init.method||"GET",
      headers:Object.fromEntries(headers.entries()),
      ...(typeof init.body==="string"?{data:init.body}:{}),
      responseType:"json",
      connectTimeout:15000,
      readTimeout:60000,
    });
  }catch{
    throw new NativeRequestError(
      navigator.onLine?"Cannot reach CA Progress. Check the connection and tap Retry.":"Offline · saved data remains available.",
      0,"NETWORK_UNAVAILABLE"
    );
  }
  const body=typeof response.data==="string"?(()=>{try{return JSON.parse(response.data);}catch{return null;}})():response.data;
  if(response.status<200||response.status>=300)
    throw new NativeRequestError(body?.error?.message||`Server returned HTTP ${response.status}. Tap Retry.`,response.status,body?.error?.code||"REQUEST_FAILED");
  if(body===null||typeof body!=="object")
    throw new NativeRequestError("The server returned an invalid response. Tap Retry.",response.status,"INVALID_RESPONSE");
  return body;
}

export async function startNativeSignIn(provider: "google" | "linkedin_oidc") {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const body = await jsonRequest("/api/v1/native-auth/start", { method: "POST", body: JSON.stringify({ provider, pkceChallenge: challenge, deviceLabel: `${Capacitor.getPlatform()} phone`, appBuild: MOBILE_BUILD.build, next: "/dashboard" }) });
  await secureSet("pkce", JSON.stringify({ transactionId: body.transactionId, verifier, expiresAt: body.expiresAt }));
  openExternalSafely(body.authorizationUrl);
}

export async function completeNativeSignIn(value: string) {
  const url = new URL(value);
  if (!/^ca-progress:\/\/auth\/complete\/?(?:[?#]|$)/.test(value)) throw new Error(`The sign-in callback is invalid (${url.protocol}//${url.host}${url.pathname}).`);
  const pendingRaw = await secureGet("pkce");
  const pending = pendingRaw ? JSON.parse(pendingRaw) as { transactionId: string; verifier: string; expiresAt: string } : null;
  const transactionId = url.searchParams.get("transaction"); const exchangeCode = url.searchParams.get("code");
  if (!pending || transactionId !== pending.transactionId || !exchangeCode || Date.parse(pending.expiresAt) <= Date.now()) throw new Error("This sign-in attempt has expired. Please try again.");
  const session = await jsonRequest("/api/v1/native-auth/exchange", { method: "POST", body: JSON.stringify({ transactionId, exchangeCode, verifier: pending.verifier }) });
  if (!session.accessToken || !session.applicationUserId) throw new Error("The sign-in exchange did not return a complete device session.");
  await secureSet("session", JSON.stringify({ token: session.accessToken, accountId: session.applicationUserId } satisfies StoredSession)); await secureRemove("pkce");
  return readNativeSession();
}

async function rotateNativeSession(accountId: string) { const session = await jsonRequest("/api/v1/native-auth/rotate", { method: "POST", body: "{}" }, true); await secureSet("session", JSON.stringify({ token: session.accessToken, accountId } satisfies StoredSession)); }
export async function readNativeSession(): Promise<NativeSessionSnapshot | null> {
  const stored = decodeSession(await secureGet("session")); if (!stored) return null;
  try {
    let snapshot = await jsonRequest("/api/v1/session", {}, true) as NativeSessionSnapshot;
    const accountId = snapshot.user?.applicationUserId;
    if (!snapshot.authenticated || !accountId || (stored.accountId && stored.accountId !== accountId)) { await secureRemove("session"); throw new Error("The device session does not match this account."); }
    if (snapshot.session?.rotateRecommended) { await rotateNativeSession(accountId); snapshot = await jsonRequest("/api/v1/session", {}, true); }
    await secureSet("session", JSON.stringify({ token: (decodeSession(await secureGet("session")) ?? stored).token, accountId } satisfies StoredSession));
    return snapshot;
  } catch (error) { if (error instanceof NativeRequestError && error.status === 401) await secureRemove("session"); throw error; }
}
export async function revokeOtherDevices() { return jsonRequest("/api/v1/session", { method: "POST", body: JSON.stringify({ action: "revoke_others" }) }, true); }
export async function logoutNative() { try { await jsonRequest("/api/v1/native-auth/revoke", { method: "POST", body: "{}" }, true); } finally { await Promise.all([secureRemove("session"), secureRemove("pkce")]); } }
