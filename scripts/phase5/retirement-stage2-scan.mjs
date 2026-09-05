import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const SOURCE_ROOTS = ["app", "components", "lib", "server", "workers"];
const SINGLE_FILES = ["proxy.ts"];
const EXCLUDED_DIRECTORIES = new Set(["node_modules", ".next", ".git", "supabase"]);
const EXCLUDED_BASENAMES = new Set(["env.ts"]);

export const FORBIDDEN_PATTERNS = [
  {
    id: "supabase-sdk-import",
    label: "Supabase SDK import",
    pattern: /(?:from\s+|import\s*\()\s*["']@supabase\/(?:supabase-js|ssr)["']/g,
  },
  {
    id: "supabase-runtime-module",
    label: "Supabase runtime module import",
    pattern: /["']@\/lib\/supabase\/(?:server|admin|client|browser|proxy)["']/g,
  },
  {
    id: "supabase-client-constructor",
    label: "Supabase client constructor",
    pattern: /\bcreate(?:Server|Admin|Browser)?SupabaseClient\b/g,
  },
  {
    id: "runtime-selector",
    label: "Supabase/Cloudflare runtime selector",
    pattern: /\b(?:CA_DATA_RUNTIME|CA_AUTH_RUNTIME|isCloudflareDataRuntime|isCloudflareAuthRuntime|isD1Runtime)\b/g,
  },
  {
    id: "supabase-runtime-secret-or-host",
    label: "Supabase runtime host or secret",
    pattern: /(?:\bSUPABASE_SERVICE_ROLE(?:_KEY)?\b|\bNEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY)\b|https?:\/\/[^\s"']+\.supabase\.co\b)/g,
  },
  {
    id: "supabase-runtime-client-usage",
    label: "Supabase runtime client usage",
    pattern: /\bsupabase\.(?:auth|storage|from|rpc)\b/gi,
  },
];

function normalizedRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function shouldSkipDirectory(name) {
  return EXCLUDED_DIRECTORIES.has(name);
}

function collectDirectoryFiles(directory, output) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && shouldSkipDirectory(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectDirectoryFiles(fullPath, output);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (EXCLUDED_BASENAMES.has(entry.name)) continue;
    output.push(fullPath);
  }
}

export function collectActiveRuntimeFiles(rootDir = process.cwd()) {
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) collectDirectoryFiles(path.join(rootDir, sourceRoot), files);
  for (const filename of SINGLE_FILES) {
    const fullPath = path.join(rootDir, filename);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) files.push(fullPath);
  }
  return [...new Set(files)].sort();
}

export function scanText(text, file = "<memory>") {
  const blockers = [];
  for (const rule of FORBIDDEN_PATTERNS) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(text)) !== null) {
      const before = text.slice(0, match.index);
      const line = before.split("\n").length;
      blockers.push({
        file,
        line,
        rule: rule.id,
        label: rule.label,
        match: match[0],
      });
      if (match[0].length === 0) rule.pattern.lastIndex += 1;
    }
  }
  return blockers;
}

export function scanRepository(rootDir = process.cwd()) {
  const files = collectActiveRuntimeFiles(rootDir);
  const blockers = [];
  for (const filePath of files) {
    const relative = normalizedRelative(rootDir, filePath);
    const text = fs.readFileSync(filePath, "utf8");
    blockers.push(...scanText(text, relative));
  }
  return { files, blockers };
}

export function formatScanResult(result, rootDir = process.cwd()) {
  const lines = [
    `Stage 2 active runtime files scanned: ${result.files.length}`,
    `Stage 2 active runtime blockers: ${result.blockers.length}`,
  ];
  for (const blocker of result.blockers) {
    lines.push(`BLOCKER ${blocker.file}:${blocker.line} [${blocker.rule}] ${blocker.match}`);
  }
  if (result.blockers.length === 0) {
    lines.push("Stage 2 runtime scan: PASS — zero active Supabase runtime blockers");
  } else {
    lines.push(`Stage 2 runtime scan: FAIL — ${result.blockers.length} blocker(s)`);
  }
  return lines.join("\n");
}

export function runCli(rootDir = process.cwd()) {
  const result = scanRepository(rootDir);
  console.log(formatScanResult(result, rootDir));
  return result.blockers.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) process.exitCode = runCli();
