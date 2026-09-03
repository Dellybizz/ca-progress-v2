import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("F1 keeps the shared shell above student route content", () => {
  assert.match(read("app/(student)/layout.tsx"), /AppShell/);
  assert.match(read("components/shell/app-shell.tsx"), /<main className="content-wrap">\{children\}<\/main>/);
  assert.match(read("components/shell/app-shell.tsx"), /NavigationProgress/);
  assert.doesNotMatch(read("components/shell/app-shell.tsx"), /await loadViewer/);
});

test("F1 prefetches desktop and mobile navigation", () => {
  assert.match(read("components/shell/navigation.tsx"), /prefetch=\{true\}/);
  assert.match(read("components/shell/mobile-nav-placeholder.tsx"), /prefetch=\{true\}/);
  assert.match(read("components/shell/navigation-progress.tsx"), /document\.addEventListener\("click"/);
});

test("F1 provides transition feedback without replacing the shell", () => {
  const progress = read("components/shell/navigation-progress.tsx");
  assert.match(progress, /NavigationProgressState key=/);
  assert.match(progress, /app-navigation-progress/);
  assert.match(read("components/study/timezone-sync.tsx"), /\}, \[\]\);/);
  assert.doesNotMatch(read("components/study/timezone-sync.tsx"), /router\.refresh/);
});

test("F1 route fallback coverage exists for primary student pages", () => {
  for (const route of ["dashboard", "community", "activity", "settings", "tests"]) {
    assert.equal(existsSync(join(root, `app/(student)/${route}/loading.tsx`)), true, `${route} loading fallback`);
    assert.equal(existsSync(join(root, `app/(student)/${route}/error.tsx`)), true, `${route} error boundary`);
  }
  assert.equal(existsSync(join(root, "app/(student)/loading.tsx")), true);
  assert.equal(existsSync(join(root, "app/(student)/error.tsx")), true);
});
