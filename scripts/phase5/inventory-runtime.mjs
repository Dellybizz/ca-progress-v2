import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["app", "lib", "workers"];
const extras = ["custom-worker.ts", "proxy.ts"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const patterns = [
  /@\/lib\/supabase\/[A-Za-z0-9_./-]+/g,
  /createServerSupabaseClient/g,
  /createAdminSupabaseClient/g,
  /getSupabaseAdminRuntimeConfig/g,
  /\.rpc\(\s*["'`]([^"'`]+)["'`]/g,
  /\.from\(\s*["'`]([^"'`]+)["'`]/g,
  /\/rest\/v1\//g,
  /supabase/gi,
];

function walk(path, out = []) {
  const info = statSync(path);
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) walk(join(path, name), out);
    return out;
  }
  const dot = path.lastIndexOf(".");
  if (dot >= 0 && extensions.has(path.slice(dot))) out.push(path);
  return out;
}

const files = [
  ...roots.flatMap((root) => walk(root)),
  ...extras.filter((path) => {
    try { return statSync(path).isFile(); } catch { return false; }
  }),
];

const matches = [];
for (const path of files) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!patterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(line); })) return;
    matches.push(`${relative(process.cwd(), path)}:${index + 1}: ${line.trim()}`);
  });
}

console.log("PHASE5_RUNTIME_INVENTORY_BEGIN");
for (const line of matches) console.log(line);
console.log("PHASE5_RUNTIME_INVENTORY_END");
console.log(`PHASE5_RUNTIME_MATCH_COUNT=${matches.length}`);
