import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname; const read = (p) => readFileSync(join(root, p), "utf8");
test("Phase 2 SSR auth boundaries exist", () => { for (const file of ["proxy.ts","lib/supabase/proxy.ts","lib/auth/server.ts","app/auth/google/route.ts","app/auth/linkedin/route.ts","app/auth/callback/route.ts","app/auth/signout/route.ts"]) assert.equal(existsSync(join(root,file)), true, file); });
test("server and proxy validate identity with getClaims instead of trusting getSession", () => { const source = read("lib/auth/server.ts") + read("lib/supabase/proxy.ts"); assert.match(source, /getClaims\(\)/); assert.equal(source.includes("getSession()"), false); });
test("Google and LinkedIn OAuth use the shared callback and preserve a sanitized destination", () => { const google = read("app/auth/google/route.ts"); const linkedin = read("app/auth/linkedin/route.ts"); const callback = read("app/auth/callback/route.ts"); assert.match(google, /startOAuthSignIn\("google"/); assert.match(linkedin, /startOAuthSignIn\("linkedin_oidc"/); assert.match(callback, /exchangeOAuthCodeForSession/); assert.match(callback, /sanitizeReturnPath/); assert.match(callback, /resolvePostAuthDestination/); });
test("phone OTP routes are removed from the active Phase 2 product", () => { assert.equal(existsSync(join(root,"app/api/auth/phone/request/route.ts")), false); assert.equal(existsSync(join(root,"app/api/auth/phone/verify/route.ts")), false); assert.equal(existsSync(join(root,"lib/auth/phone.ts")), false); const login = read("components/auth/login-panel.tsx"); assert.equal(/phone OTP|Send OTP|verifyOtp|signInWithOtp/i.test(login), false); });
test("guest mode is local-only and has no Supabase dependency", () => { const guest = read("lib/auth/guest.ts"); assert.match(guest, /localStorage/); assert.match(guest, /crypto\.randomUUID/); assert.equal(/supabase/i.test(guest), false); });
test("remember-device behavior can convert auth cookies to browser-session cookies", () => { const cookies = read("lib/auth/session-cookies.ts"); assert.match(cookies, /AUTH_COOKIE/); assert.match(cookies, /sameSite: "lax"/); assert.equal(/maxAge|expires/i.test(cookies), false); });
