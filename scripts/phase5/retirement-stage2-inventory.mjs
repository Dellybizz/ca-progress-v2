import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOTS = ["app", "components", "lib", "workers"];
const ROOT_FILES = ["custom-worker.ts", "proxy.ts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_PATHS = [
  /^lib\/data\/migration-contract\.ts$/,
  /^lib\/data\/phase2-contract\.ts$/,
  /^lib\/data\/phase4-shadow-read\.ts$/,
];
const PATTERNS = [
  ["supabase-sdk-import", /@supabase\/(?:ssr|supabase-js)/i],
  ["legacy-server-client", /createServerSupabaseClient/],
  ["legacy-admin-client", /createAdminSupabaseClient/],
  ["legacy-browser-client", /(?:createBrowserSupabaseClient|createBrowserClient)/],
  ["supabase-runtime-path", /@\/lib\/supabase\//],
  ["cloudflare-data-runtime-branch", /isCloudflareDataRuntime/],
  ["cloudflare-auth-runtime-branch", /isCloudflareAuthRuntime/],
  ["supabase-auth-api", /\.auth\.(?:signInWithOAuth|exchangeCodeForSession|getClaims|getUser|getSession|signOut|refreshSession)/],
  ["supabase-storage-api", /\.storage\.(?:from|listBuckets|getBucket|createBucket|download|upload|remove)/],
  ["supabase-rpc-call", /\.rpc\s*\(/],
  ["supabase-host", /(?:https?:\/\/)?[A-Za-z0-9.-]+\.supabase\.co/i],
  ["supabase-token", /supabase/i],
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (entry.isFile() && EXTENSIONS.has(extname(entry.name))) out.push(path);
  }
  return out;
}

function active(path) {
  const normalized = path.replaceAll("\\", "/");
  return !SKIP_PATHS.some((pattern) => pattern.test(normalized));
}

const files = [];
for (const root of ROOTS) {
  try { files.push(...await walk(root)); } catch {}
}
for (const file of ROOT_FILES) {
  try { await readFile(file); files.push(file); } catch {}
}

const matches = [];
for (const file of [...new Set(files.map((p) => relative(".", p).replaceAll("\\", "/")))].filter(active).sort()) {
  const text = await readFile(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [kind, pattern] of PATTERNS) {
      if (pattern.test(line)) {
        matches.push({ file, line: index + 1, kind, snippet: line.trim().slice(0, 500) });
        pattern.lastIndex = 0;
      }
    }
  });
}

const byKind = Object.fromEntries(PATTERNS.map(([kind]) => [kind, matches.filter((m) => m.kind === kind).length]));
const filesWithMatches = [...new Set(matches.map((m) => m.file))];
const report = {
  schemaVersion: 1,
  activeRoots: [...ROOTS, ...ROOT_FILES],
  scannedFileCount: [...new Set(files)].length,
  filesWithMatches: filesWithMatches.length,
  byKind,
  matches,
};
await mkdir("retirement-stage2-inventory", { recursive: true });
await writeFile("retirement-stage2-inventory/runtime-scan.json", `${JSON.stringify(report, null, 2)}\n`);
await writeFile("retirement-stage2-inventory/runtime-scan.txt", `${matches.map((m) => `${m.file}:${m.line}\t${m.kind}\t${m.snippet}`).join("\n")}\n`);
console.log(JSON.stringify({ scannedFileCount: report.scannedFileCount, filesWithMatches: report.filesWithMatches, byKind }, null, 2));
