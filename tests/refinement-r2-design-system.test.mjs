import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("R2 resolves System Light and Dark before first paint", () => {
  const layout = read("app/layout.tsx");
  const runtime = read("components/preferences/appearance-runtime.tsx");
  assert.match(layout, /appearanceBootScript/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(runtime, /addEventListener\("change"/);
  assert.match(runtime, /addEventListener\("storage"/);
});

test("R2 preserves canonical preference options and exposes accessible controls", () => {
  const controls = read("components/preferences/appearance-controls.tsx");
  const settings = read("app/(student)/settings/page.tsx");
  for (const value of ["themeOptions", "accentOptions", "densityOptions", "role=\"switch\"", "aria-pressed"]) assert.match(controls, new RegExp(value));
  assert.match(settings, /AppearanceControls/);
  assert.doesNotMatch(settings, /ProductPreviewPage/);
});

test("R2 adaptive primitives support mobile transformation without hiding outcomes", () => {
  const adaptive = read("components/ui/adaptive.tsx");
  const chart = read("components/ui/chart-frame.tsx");
  const css = read("app/styles/components.css");
  for (const value of ["FilterSheet", "StickyActionArea", "MobileSummary", "Accordion"]) assert.match(adaptive, new RegExp(value));
  assert.match(chart, /View chart data/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /--touch-target/);
});

test("R2 keeps reduced motion available from system and explicit preference", () => {
  const tokens = read("app/styles/tokens.css");
  const components = read("app/styles/components.css");
  assert.match(tokens, /data-reduce-motion="true"/);
  assert.match(components, /prefers-reduced-motion: reduce/);
});
