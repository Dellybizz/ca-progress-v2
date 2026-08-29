import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname; const read = (p) => readFileSync(join(root, p), "utf8");
test("Phase 2 SSR auth boundaries exist", () => { for (const file of ["proxy.ts","lib/supabase/proxy.ts","lib/auth/server.ts","app/auth/google/route.ts","app/auth/callback/route.ts","app/auth/signout/route.ts"]) assert.equal(existsSync(join(root,file)), true, file); });
test("server and proxy validate identity with getClaims instead of trusting getSession", () => { const source = read("lib/auth/server.ts") + read("lib/supabase/proxy.ts"); assert.match(source, /getClaims\(\)/); assert.equal(source.includes("getSession()"), false); });
test("Google OAuth uses PKCE callback exchange and preserves a sanitized destination", () => { const google = read("app/auth/google/route.ts"); const callback = read("app/auth/callback/route.ts"); assert.match(google, /signInWithOAuth/); assert.match(google, /provider: "google"/); assert.match(callback, /exchangeCodeForSession/); assert.match(callback, /sanitizeReturnPath/); assert.match(callback, /resolvePostAuthDestination/); });
test("phone OTP request and verify routes are rate-gated", () => { const request = read("app/api/auth/phone/request/route.ts"); const verify = read("app/api/auth/phone/verify/route.ts"); const limiter = read("lib/auth/phone.ts"); assert.match(request, /signInWithOtp/); assert.match(verify, /verifyOtp/); assert.match(request, /consumeOtpRateLimit/); assert.match(verify, /consumeOtpRateLimit/); assert.match(limiter, /sha256/); assert.match(limiter, /AUTH_RATE_LIMIT_SALT|rateLimitSalt/); });
test("guest mode is local-only and has no Supabase dependency", () => { const guest = read("lib/auth/guest.ts"); assert.match(guest, /localStorage/); assert.match(guest, /crypto\.randomUUID/); assert.equal(/supabase/i.test(guest), false); });
test("remember-device behavior can convert auth cookies to browser-session cookies", () => { const cookies = read("lib/auth/session-cookies.ts"); assert.match(cookies, /AUTH_COOKIE/); assert.match(cookies, /sameSite: "lax"/); assert.equal(/maxAge|expires/i.test(cookies), false); });
