import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(root, ".open-next", "worker.js");
const assetsPath = path.join(root, ".open-next", "assets");
const ignoredDirectories = new Set([".git", ".next", ".open-next", "node_modules"]);
const sourceExtensions = new Set([".cjs", ".css", ".js", ".json", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

function safeStat(target) {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function newestSourceMtime(directory) {
  let newest = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtime(target));
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) continue;
    newest = Math.max(newest, statSync(target).mtimeMs);
  }
  return newest;
}

function hasFreshOpenNextOutput() {
  const worker = safeStat(workerPath);
  const assets = safeStat(assetsPath);
  if (!worker?.isFile() || !assets?.isDirectory()) return false;
  return worker.mtimeMs >= newestSourceMtime(root);
}

if (hasFreshOpenNextOutput()) {
  console.log("[cloudflare-build] Reusing fresh OpenNext output.");
  process.exit(0);
}

console.log("[cloudflare-build] OpenNext output is missing or stale; building before Wrangler deploy.");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "cf:build"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const worker = safeStat(workerPath);
const assets = safeStat(assetsPath);
if (!worker?.isFile() || !assets?.isDirectory()) {
  console.error("[cloudflare-build] OpenNext build completed without the required worker/assets output.");
  process.exit(1);
}
