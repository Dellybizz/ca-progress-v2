import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { refinementR1RouteDecisions } from "../config/refinement-r1-route-decisions.mjs";
import { contrastRatio, refinementR2ColorPairs } from "../config/refinement-r2-accessibility.mjs";
import { routeContracts } from "../config/product-consistency-route-contracts.mjs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("R1 reconciles every certified R0 route with an intentional mobile decision", () => {
  assert.equal(refinementR1RouteDecisions.length, routeContracts.length);
  assert.deepEqual(refinementR1RouteDecisions.map(item => item.route), routeContracts.map(item => item.route));
  assert.ok(refinementR1RouteDecisions.every(item => item.primaryAction && item.hierarchy.length >= 4 && item.transformations.length >= 4 && item.outcomeParity));
});

test("R1 Refero evidence is reproducible and does not invent private screen IDs", () => {
  const evidence = read("docs/refinement-r1/REFERO_EVIDENCE.md");
  for (const id of ["REF-DASHBOARD", "REF-ONBOARDING", "REF-DIALOG", "REF-WEB", "REF-IOS", "REF-STYLES"]) assert.match(evidence, new RegExp(id));
  assert.match(evidence, /never invents screen IDs/i);
  for (const field of ["hierarchy", "density", "navigation", "component behaviour"]) assert.match(evidence, new RegExp(field, "i"));
});

test("R2 light and dark text, action and focus pairs meet their WCAG thresholds", () => {
  for (const [name, foreground, background, minimum] of refinementR2ColorPairs) {
    assert.ok(contrastRatio(foreground, background) >= minimum, name + " contrast is below " + minimum + ":1");
  }
});

test("R2 exposes every promised common primitive family with mobile outcome parity", () => {
  const avatar = read("components/ui/avatar.tsx");
  const data = read("components/ui/data-view.tsx");
  const status = read("components/ui/status-state.tsx");
  const popover = read("components/ui/popover.tsx");
  const css = read("app/styles/components.css");
  assert.match(avatar, /role="img"[\s\S]*aria-label/);
  assert.match(data, /<table[\s\S]*<caption[\s\S]*role="list"/);
  assert.match(status, /error[\s\S]*offline[\s\S]*stale/);
  for (const behavior of ["pointerdown", "Escape", "ArrowDown", "ArrowUp", "Home", "End"]) assert.match(popover, new RegExp(behavior));
  assert.match(css, /\.ui-data-table-wrap \{ display: none; \}[\s\S]*\.ui-data-cards \{ display: grid/);
  assert.match(css, /safe-area-inset-bottom/);
});

