import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const budgetIndex = args.indexOf("--budget-mib");
const config = configIndex >= 0 ? args[configIndex + 1] : null;
const budgetMiB = budgetIndex >= 0 ? Number(args[budgetIndex + 1]) : 2.7;
if (!Number.isFinite(budgetMiB) || budgetMiB <= 0) throw new Error("--budget-mib must be a positive number.");

const wranglerArgs = ["wrangler", "deploy", "--dry-run"];
if (config) wranglerArgs.push("--config", config);

const child = spawn("npx", wranglerArgs, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
}

const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) process.exit(Number(exitCode) || 1);

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
