import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const source = readFileSync("scripts/auth/phase0-baseline.sql", "utf8")
  .split("\n").filter(line => !line.trim().startsWith("--")).join("\n");
const statements = source.split(";").map(part => part.trim()).filter(Boolean);
if (statements.length !== 22 || statements.some(sql => !/^(PRAGMA foreign_key_check|SELECT\b)/i.test(sql))) {
  throw new Error("Unexpected statement in read-only audit");
}

const results = [];
for (let index = 0; index < statements.length; index++) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", "ca-progress-v2-phase4-shadow", "--remote", "--config=wrangler.jsonc", "--json", "--command", statements[index]], { encoding: "utf8", timeout: 60000 });
  const start = output.indexOf("[");
  if (start < 0) throw new Error(`D1 query ${index + 1} did not return JSON`);
  const response = JSON.parse(output.slice(start));
  if (!Array.isArray(response) || response.length !== 1 || response[0].success !== true || !Array.isArray(response[0].results)) {
    throw new Error(`D1 query ${index + 1} failed`);
  }
  results.push({ success: true, results: response[0].results });
  process.stdout.write(`Read-only D1 query ${index + 1}/${statements.length} complete\n`);
}
writeFileSync("deployment-evidence/auth-phase0-counts.json", JSON.stringify(results, null, 2));
