import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const budgetIndex = args.indexOf("--budget-mib");
const reportIndex = args.indexOf("--report-top");
const config = configIndex >= 0 ? args[configIndex + 1] : null;
const budgetMiB = budgetIndex >= 0 ? Number(args[budgetIndex + 1]) : 2.7;
const reportTop = reportIndex >= 0 ? Number(args[reportIndex + 1]) : 0;
if (!Number.isFinite(budgetMiB) || budgetMiB <= 0) throw new Error("--budget-mib must be a positive number.");
if (!Number.isInteger(reportTop) || reportTop < 0) throw new Error("--report-top must be a non-negative integer.");

const reportDir = reportTop > 0 ? mkdtempSync(join(tmpdir(), "ca-progress-worker-bundle-")) : null;
const metafile = reportDir ? join(reportDir, "bundle-meta.json") : null;
const wranglerArgs = ["wrangler", "deploy", "--dry-run"];
if (config) wranglerArgs.push("--config", config);
if (reportDir && metafile) wranglerArgs.push("--outdir", reportDir, "--metafile", metafile);

const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", wranglerArgs, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
}

const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) {
  if (reportDir) rmSync(reportDir, { recursive: true, force: true });
  process.exit(Number(exitCode) || 1);
}

if (metafile) {
  try {
    const meta = JSON.parse(readFileSync(metafile, "utf8"));
    const contributions = new Map();
    for (const outputMeta of Object.values(meta.outputs ?? {})) {
      for (const [input, details] of Object.entries(outputMeta.inputs ?? {})) {
        contributions.set(input, (contributions.get(input) ?? 0) + Number(details.bytesInOutput ?? 0));
      }
    }
    const top = [...contributions.entries()].sort((a, b) => b[1] - a[1]).slice(0, reportTop);
    if (top.length) {
      console.log(`[cloudflare-size] Top ${top.length} bundled inputs by emitted bytes:`);
      for (const [input, bytes] of top) console.log(`[cloudflare-size] ${(bytes / 1024).toFixed(1)} KiB  ${input}`);
    }
  } catch (error) {
    console.warn(`[cloudflare-size] Bundle attribution unavailable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

const matches = [...output.matchAll(/(?:gzip|compressed)(?:\s+size)?\s*[:=]?\s*([\d.]+)\s*(KiB|MiB|KB|MB)/gi)];
if (!matches.length) {
  console.error("[cloudflare-size] Could not find Wrangler compressed/gzip size in dry-run output.");
  process.exit(1);
}
const [, rawValue, rawUnit] = matches.at(-1);
const value = Number(rawValue);
const unit = rawUnit.toLowerCase();
const compressedMiB = unit === "mib" || unit === "mb" ? value : value / 1024;
const label = config || "main OpenNext Worker";
console.log(`[cloudflare-size] ${label}: ${compressedMiB.toFixed(3)} MiB compressed; budget ${budgetMiB.toFixed(2)} MiB.`);
if (compressedMiB > budgetMiB) {
  console.error(`[cloudflare-size] FAIL: ${label} exceeds the repository budget. Split or trim code before deployment instead of consuming the platform hard limit.`);
  process.exit(1);
}
console.log(`[cloudflare-size] PASS: ${label} remains below the repository budget.`);
