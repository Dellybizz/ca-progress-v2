import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");
const styles = ["app/globals.css", "app/styles/tokens.css", "app/styles/shell.css", "app/styles/components.css", "app/styles/dashboard.css", "app/styles/surfaces.css"].map(read).join("\n");
const primitives = ["button", "input", "select", "tabs", "card", "overlay", "toast", "badge", "skeleton", "empty-state", "progress"];

test("Phase 1 core design-system primitives exist", () => { for (const primitive of primitives) assert.equal(existsSync(join(root, `components/ui/${primitive}.tsx`)), true, primitive); });
test("tokens include responsive, semantic, focus and dark-mode readiness", () => { for (const token of ["--space-4", "--radius-lg", "--shadow-md", "--color-success", "--color-danger", "--touch-target"]) assert.match(styles, new RegExp(token)); assert.match(styles, /data-theme="dark"/); assert.match(styles, /:focus-visible/); assert.match(styles, /prefers-reduced-motion/); for (const width of [375, 390, 430, 900]) assert.match(styles, new RegExp(`min-width: ${width}px`)); });
test("interactive components expose consistent state contracts", () => { const button = read("components/ui/button.tsx"); const input = read("components/ui/input.tsx"); const overlay = read("components/ui/overlay.tsx"); assert.match(button, /isLoading/); assert.match(button, /disabled/); assert.match(input, /aria-invalid/); assert.match(overlay, /aria-modal="true"/); assert.match(overlay, /Escape/); });
