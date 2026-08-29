import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const css = readFileSync(join(root, "app/globals.css"), "utf8");

test("explicit mobile and desktop layout contracts exist", () => {
  for (const width of [375, 390, 430, 900]) assert.match(css, new RegExp(`min-width: ${width}px`));
  assert.match(css, /mobile-bottom-nav/);
  assert.match(css, /desktop-sidebar/);
});
