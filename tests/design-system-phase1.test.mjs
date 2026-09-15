import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const tokens = read("app/styles/tokens.css");
const components = read("app/styles/components.css");
const globals = read("app/globals.css");

test("Phase 1 preserves the established token API while keeping geometry restrained", () => {
  for (const token of [
    "--color-surface-raised",
    "--color-surface-inverse",
    "--color-brand-contrast",
    "--text-2xl",
    "--touch-target",
    "--space-7",
  ]) assert.match(tokens, new RegExp(`${token}:`));
  assert.match(tokens, /--radius-sm:\s*8px;/);
  assert.match(tokens, /--radius-md:\s*10px;/);
  assert.match(tokens, /--radius-lg:\s*12px;/);
  assert.match(tokens, /--shadow-xs:\s*0 1px 2px rgba\(17, 24, 39, \.035\);/);
  assert.match(tokens, /--color-brand:\s*#5b5bd6;/);
  assert.match(tokens, /:root\[data-theme="dark"\]/);
  assert.match(tokens, /:root\[data-theme="dark"\]\[data-accent="violet"\]/);
  assert.match(tokens, /:root\[data-theme="dark"\]\[data-accent="emerald"\]/);
  assert.match(tokens, /:root\[data-theme="dark"\]\[data-accent="rose"\]/);
});

test("Phase 1 preserves existing primitive class contracts", () => {
  for (const selector of [
    ".ui-field",
    ".ui-input-wrap",
    ".ui-select",
    ".ui-card",
    ".ui-badge",
    ".ui-progress-group",
    ".ui-empty",
    ".ui-tabs__list",
    ".ui-dialog--sheet",
    ".ui-toast",
  ]) assert.ok(components.includes(selector), `Missing primitive contract ${selector}`);
});

test("Phase 1 primitives avoid generic floating SaaS treatments", () => {
  assert.match(components, /\.ui-card\s*\{[\s\S]*?box-shadow:\s*none;/);
  assert.doesNotMatch(components, /translateY\(-1px\)/);
  assert.doesNotMatch(components, /translateY\(-2px\)/);
  assert.match(components, /\.ui-progress span\s*\{[\s\S]*?background:\s*var\(--color-brand\);/);
  assert.match(components, /\.page-header__eyebrow\s*\{[\s\S]*?text-transform:\s*none;/);
  assert.match(components, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Phase 1 foundation loads before route styles while Phase 2 shell remains final chrome authority", () => {
  const tokensIndex = globals.indexOf('@import "./styles/tokens.css";');
  const componentsIndex = globals.indexOf('@import "./styles/components.css";');
  const dashboardIndex = globals.indexOf('@import "./styles/dashboard.css";');
  const shellIndex = globals.indexOf('@import "./styles/shell.css";');
  assert.ok(tokensIndex >= 0, "tokens.css must remain globally imported");
  assert.ok(componentsIndex > tokensIndex, "components.css must load after tokens.css");
  assert.ok(dashboardIndex > componentsIndex, "route styles must load after shared primitives");
  assert.ok(shellIndex > dashboardIndex, "canonical shell must load after route-era styles");
});
