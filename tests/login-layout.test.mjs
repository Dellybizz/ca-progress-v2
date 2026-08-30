import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("desktop login reserves readable width for intro and auth card", () => {
  const css = read("app/styles/auth-login-fix.css");
  assert.match(css, /public-content:has\(\.auth-v2-layout\)/);
  assert.match(css, /max-width:\s*1040px/);
  assert.match(css, /grid-template-columns:\s*minmax\(260px,\s*1fr\)\s*minmax\(360px,\s*440px\)/);
  assert.match(css, /word-break:\s*normal/);
});

test("mid-size desktop login falls back to a focused single-column card", () => {
  const css = read("app/styles/auth-login-fix.css");
  assert.match(css, /min-width:\s*900px\) and \(max-width:\s*1399px/);
  assert.match(css, /\.auth-v2-intro\s*\{\s*display:\s*none/);
});

test("public login copy is product-facing rather than internal phase/debug language", () => {
  const shell = read("components/shell/public-shell.tsx");
  const login = read("components/auth/login-panel.tsx");
  assert.doesNotMatch(shell, /Phase 1 UX|Phase 1 establishes/);
  assert.doesNotMatch(login, /Phase 2 identity|Supabase RLS|hydration|Server Components/);
  assert.match(login, /Continue with Google/);
  assert.match(login, /Continue with LinkedIn/);
  assert.match(login, /Continue as Guest/);
  assert.match(login, /Remember this device/);
});
