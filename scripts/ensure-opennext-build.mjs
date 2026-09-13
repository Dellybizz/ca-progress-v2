import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(root, ".open-next", "worker.js");
const assetsPath = path.join(root, ".open-next", "assets");
const sourceExtensions = new Set([".cjs", ".css", ".js", ".json", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const sourceInputs = [
  "app",
  "components",
  "lib",
  "server",
  "public",
  "custom-worker.ts",
  "community-coordinator.ts",
  "open-next.config.ts",
  "next.config.ts",
  "next.config.mjs",
  "proxy.ts",
  "middleware.ts",
  "instrumentation.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "scripts/patch-opennext-vercel-og.mjs",
].map((entry) => path.join(root, entry));

function safeStat(target) {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function newestInputMtime(target) {
  const stat = safeStat(target);
  if (!stat) return 0;
  if (stat.isFile()) return sourceExtensions.has(path.extname(target)) ? stat.mtimeMs : 0;
  if (!stat.isDirectory()) return 0;
  let newest = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    newest = Math.max(newest, newestInputMtime(path.join(target, entry.name)));
  }
  return newest;
}

function hasFreshOpenNextOutput() {
  const worker = safeStat(workerPath);
  const assets = safeStat(assetsPath);
  if (!worker?.isFile() || !assets?.isDirectory()) return false;
  const newestSource = Math.max(...sourceInputs.map(newestInputMtime));
  return worker.mtimeMs >= newestSource;
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
