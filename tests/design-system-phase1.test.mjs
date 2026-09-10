import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const tokens = read("app/styles/tokens.css");
const components = read("app/styles/components.css");
const globals = read("app/globals.css");

test("Phase 1 keeps the canonical design foundation compact and restrained", () => {
  assert.match(tokens, /--radius-lg:\s*12px;/);
  assert.match(tokens, /--shadow-xs:\s*0 1px 2px rgba\(17, 24, 39, \.035\);/);
  assert.match(tokens, /--color-brand:\s*#5b5bd6;/);
  assert.match(tokens, /\[data-theme="dark"\]\[data-accent="violet"\]/);
  assert.match(tokens, /\[data-theme="dark"\]\[data-accent="emerald"\]/);
  assert.match(tokens, /\[data-theme="dark"\]\[data-accent="rose"\]/);
});

test("Phase 1 shared primitives avoid generic floating SaaS treatments", () => {
  assert.match(components, /\.ui-card\s*\{[\s\S]*?box-shadow:\s*none;/);
  assert.doesNotMatch(components, /translateY\(-1px\)/);
  assert.doesNotMatch(components, /translateY\(-2px\)/);
  assert.match(components, /\.ui-progress span\s*\{[\s\S]*?background:\s*var\(--color-brand\);/);
  assert.match(components, /\.page-header__eyebrow\s*\{[\s\S]*?text-transform:\s*none;/);
  assert.match(components, /@media \(prefers-reduced-motion: reduce\)/);
});

test("canonical tokens load before shared components", () => {
  const tokensIndex = globals.indexOf('@import "./styles/tokens.css";');
  const componentsIndex = globals.indexOf('@import "./styles/components.css";');
  assert.ok(tokensIndex >= 0, "tokens.css must remain globally imported");
  assert.ok(componentsIndex > tokensIndex, "components.css must load after tokens.css");
});
