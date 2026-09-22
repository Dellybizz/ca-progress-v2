import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const binary = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

test("Phase 5 publishes a standalone CA Progress manifest with shortcuts", () => {
  const manifest = read("app/manifest.ts");
  assert.match(manifest, /name: "CA Progress"/);
  assert.match(manifest, /start_url: "\/dashboard\?source=pwa"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /purpose: "maskable"/);
  for (const route of ["/today", "/study", "/progress"]) assert.match(manifest, new RegExp(route.replace("/", "\\/")));
});

test("Phase 5 includes correctly sized install and Apple icons", () => {
  const sizes = new Map([
    ["public/icons/app-icon-192.png", [192, 192]],
    ["public/icons/app-icon-512.png", [512, 512]],
    ["public/icons/app-icon-maskable-512.png", [512, 512]],
    ["public/icons/apple-touch-icon.png", [180, 180]],
  ]);
  for (const [path, [width, height]] of sizes) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} is missing`);
    const png = binary(path);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
  }
});

test("Phase 5 installs only after user action and supports iOS guidance", () => {
  const runtime = read("components/pwa/pwa-runtime.tsx");
  assert.match(runtime, /beforeinstallprompt/);
  assert.match(runtime, /event\.preventDefault\(\)/);
  assert.match(runtime, /await installPrompt\.prompt\(\)/);
  assert.match(runtime, /Add CA Progress to your Home Screen/);
  assert.match(runtime, /appinstalled/);
});

test("Phase 5 checks for updates and activates a waiting worker explicitly", () => {
  const runtime = read("components/pwa/pwa-runtime.tsx");
  const worker = read("public/sw.js");
  assert.match(runtime, /updateViaCache: "none"/);
  assert.match(runtime, /30 \* 60 \* 1000/);
  assert.match(runtime, /visibilitychange/);
  assert.match(runtime, /waiting\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(runtime, /controllerchange/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.doesNotMatch(worker, /await self\.skipWaiting\(\);\s*\}\)\)\);/);
});

test("Phase 5 preserves the private-data cache boundary", () => {
  const worker = read("public/sw.js");
  assert.match(worker, /ca-progress-shell-v5/);
  assert.match(worker, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(worker, /cache\.put\("\/offline", shell\)/);
  assert.doesNotMatch(worker, /cache\.put\(request, response\.clone\(\)\).*navigation/);
  assert.doesNotMatch(worker, /\/api\//);
  assert.match(worker, /token\|signature\|credential/);
});

test("Phase 5 owns service-worker registration at the root boundary", () => {
  const layout = read("app/layout.tsx");
  const offline = read("components/offline/offline-runtime.tsx");
  assert.match(layout, /PwaRuntime/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layout, /appleWebApp/);
  assert.doesNotMatch(offline, /serviceWorker\?\.register/);
});
