import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

function sourceFiles(directory) {
  const path = join(root, directory);
  const result = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) result.push(...sourceFiles(join(directory, name)));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(name)) result.push(child);
  }
  return result;
}

test("application source does not use Next OG image generation", () => {
  for (const file of ["app", "components", "lib"].flatMap(sourceFiles)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(?:from\s+["']next\/og["']|import\s*\(\s*["']next\/og["']\s*\)|\bImageResponse\b)/, file);
  }
});

test("Cloudflare builds strip the unused Vercel OG runtime without creating rejected startup promises", () => {
  const pkg = JSON.parse(read("package.json"));
  const patch = read("scripts/patch-opennext-vercel-og.mjs");
  assert.match(pkg.scripts["cf:build"], /patch-opennext-vercel-og\.mjs/);
  assert.match(pkg.scripts["cf:deploy"], /npm run cf:build/);
  assert.match(pkg.scripts["cf:check"], /npm run cf:build/);
  assert.ok(patch.includes("@vercel\\/og\\/index\\.edge\\.js"));
  assert.match(patch, /Refusing to strip @vercel\/og because application source uses OG image generation/);
  assert.match(patch, /Promise\.resolve\(Object\.freeze\(\{\}\)\)/);
  assert.doesNotMatch(patch, /const replacement\s*=\s*["']Promise\.reject/);
});

test("shared shell renders without a viewer lookup and hydrates viewer status separately", () => {
  const shell = read("components/shell/app-shell.tsx");
  assert.doesNotMatch(shell, /await loadViewer\(\)/);
  assert.match(shell, /<ViewerStatus\/>/);
  assert.match(shell, /<TopbarControls\/>/);
  assert.match(read("app/api/auth/viewer/route.ts"), /loadViewer/);
  assert.match(read("components/shell/viewer-client.ts"), /useSyncExternalStore/);
});
