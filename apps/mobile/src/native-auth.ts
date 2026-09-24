import { Capacitor, registerPlugin } from "@capacitor/core";
import { MOBILE_BUILD } from "./build";
import { openExternalSafely } from "./runtime";

const API_ORIGIN = "https://ca-progress-v2.habeebaasif622.workers.dev";
const SecureSession = registerPlugin<{ set(input: { key: "session" | "pkce"; value: string }): Promise<void>; get(input: { key: "session" | "pkce" }): Promise<{ value: string | null }>; remove(input: { key: "session" | "pkce" }): Promise<void> }>("SecureSession");
const browserMemory: Record<string, string | undefined> = {};

export type NativeSessionSnapshot = { authenticated: boolean; user?: { applicationUserId?: string; displayName?: string | null; email?: string | null; avatarUrl?: string | null }; session?: { rotateRecommended?: boolean } };

async function secureSet(key: "session" | "pkce", value: string) { if (Capacitor.isNativePlatform()) await SecureSession.set({ key, value }); else browserMemory[key] = value; }
async function secureGet(key: "session" | "pkce") { return Capacitor.isNativePlatform() ? (await SecureSession.get({ key })).value : browserMemory[key] || null; }
async function secureRemove(key: "session" | "pkce") { if (Capacitor.isNativePlatform()) await SecureSession.remove({ key }); else delete browserMemory[key]; }
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function jsonRequest(path: string, init: RequestInit = {}, authenticated = false) {
  const token = authenticated ? await secureGet("session") : null;
  const response = await fetch(`${API_ORIGIN}${path}`, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", "X-CA-API-Version": String(MOBILE_BUILD.apiVersion), "X-CA-App-Build": String(MOBILE_BUILD.build), "X-CA-Native-App": MOBILE_BUILD.applicationId, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || "The request could not be completed.");
  return body;
}
export async function nativeApiRequest(path:string,init:RequestInit={}){return jsonRequest(path,init,true);}

export async function startNativeSignIn(provider: "google" | "linkedin_oidc") {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const body = await jsonRequest("/api/v1/native-auth/start", { method: "POST", body: JSON.stringify({ provider, pkceChallenge: challenge, deviceLabel: `${Capacitor.getPlatform()} phone`, appBuild: MOBILE_BUILD.build, next: "/dashboard" }) });
  await secureSet("pkce", JSON.stringify({ transactionId: body.transactionId, verifier, expiresAt: body.expiresAt }));
  openExternalSafely(body.authorizationUrl);
}

export async function completeNativeSignIn(value: string) {
  const url = new URL(value);
  if (url.protocol !== "ca-progress:" || url.host !== "auth" || url.pathname !== "/complete") throw new Error(`The sign-in callback is invalid (${url.protocol}//${url.host}${url.pathname}).`);
  const pendingRaw = await secureGet("pkce");
  const pending = pendingRaw ? JSON.parse(pendingRaw) as { transactionId: string; verifier: string; expiresAt: string } : null;
  const transactionId = url.searchParams.get("transaction"); const exchangeCode = url.searchParams.get("code");
  if (!pending || transactionId !== pending.transactionId || !exchangeCode || Date.parse(pending.expiresAt) <= Date.now()) throw new Error("This sign-in attempt has expired. Please try again.");
  const session = await jsonRequest("/api/v1/native-auth/exchange", { method: "POST", body: JSON.stringify({ transactionId, exchangeCode, verifier: pending.verifier }) });
  await secureSet("session", session.accessToken); await secureRemove("pkce");
  return readNativeSession();
}

async function rotateNativeSession() { const session = await jsonRequest("/api/v1/native-auth/rotate", { method: "POST", body: "{}" }, true); await secureSet("session", session.accessToken); }
export async function readNativeSession(): Promise<NativeSessionSnapshot | null> {
  const token = await secureGet("session"); if (!token) return null;
  try {
    let snapshot = await jsonRequest("/api/v1/session", {}, true) as NativeSessionSnapshot;
    if (snapshot.session?.rotateRecommended) { await rotateNativeSession(); snapshot = await jsonRequest("/api/v1/session", {}, true); }
    return snapshot;
  } catch (error) { await secureRemove("session"); throw error; }
}
export async function revokeOtherDevices() { return jsonRequest("/api/v1/session", { method: "POST", body: JSON.stringify({ action: "revoke_others" }) }, true); }
export async function logoutNative() { try { await jsonRequest("/api/v1/native-auth/revoke", { method: "POST", body: "{}" }, true); } finally { await Promise.all([secureRemove("session"), secureRemove("pkce")]); } }
