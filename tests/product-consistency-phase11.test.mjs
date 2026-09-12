import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 11 defines one canonical cool-paper and CA purple token language", () => {
  const tokens = read("app/styles/tokens.css");
  assert.match(tokens, /--color-bg:\s*#f6f7fa/);
  assert.match(tokens, /--color-text:\s*#172033/);
  assert.match(tokens, /--color-brand:\s*#5b5bd6/);
  assert.match(tokens, /--color-success:/);
  assert.match(tokens, /--color-warning:/);
  assert.match(tokens, /--color-danger:/);
});

test("Phase 11 canonical layer loads after route-era styles", () => {
  const globals = read("app/globals.css");
  const shell = globals.indexOf('@import "./styles/shell.css"');
  const phase11 = globals.indexOf('@import "./styles/product-consistency-phase11.css"');
  assert.ok(shell >= 0 && phase11 > shell);
});

test("Phase 11 standardizes uncertain, error, permission and stale states", () => {
  const state = read("components/states/status-panel.tsx");
  const error = read("components/states/route-error-view.tsx");
  for (const tone of ["neutral", "info", "success", "warning", "danger", "permission", "stale"]) assert.match(state, new RegExp(`${tone}:`));
  assert.match(error, /StatusPanel tone="danger"/);
});

test("Phase 11 data views retain every labeled field in purpose-built mobile rows", () => {
  const css = read("app/styles/product-consistency-phase11.css");
  const users = read("app/(admin)/admin/users/page.tsx");
  const billing = read("app/(student)/billing/page.tsx");
  assert.match(css, /\.data-table td::before\s*\{\s*content:\s*attr\(data-label\)/);
  assert.match(users, /className="data-table"/);
  assert.match(users, /data-label="CA profile"/);
  assert.match(billing, /data-label="Provider reference"/);
});

test("Phase 11 overlays trap and restore focus and honor reduced motion", () => {
  const overlay = read("components/ui/overlay.tsx");
  const components = read("app/styles/components.css");
  assert.match(overlay, /previous\?\.focus\(\)/);
  assert.match(overlay, /event\.key !== "Tab"/);
  assert.match(overlay, /aria-labelledby=/);
  assert.match(components, /prefers-reduced-motion:\s*reduce/);
});

test("Phase 11 remains a migration-free visual unification", () => {
  const phase11 = read("app/styles/product-consistency-phase11.css");
  assert.match(phase11, /canonical visual contracts/);
  assert.doesNotMatch(phase11, /DELETE FROM|DROP TABLE|ALTER TABLE/i);
});
