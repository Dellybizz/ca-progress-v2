import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const persistTo = mkdtempSync(join(tmpdir(), "ca-progress-d1-phase2-"));
const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
const base = ["wrangler", "--config", "wrangler.d1.phase2.jsonc"];

function run(args) {
  return execFileSync(wrangler, [...base, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1", NO_D1_WARNING: "true" },
  });
}

try {
  run(["d1", "migrations", "apply", "ca-progress-v2-phase2-local", "--local", "--persist-to", persistTo]);

  const schema = run([
    "d1", "execute", "ca-progress-v2-phase2-local", "--local", "--persist-to", persistTo,
    "--command", "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
    "--json",
  ]);
  const parsed = JSON.parse(schema);
  const tableCount = parsed?.[0]?.results?.[0]?.table_count ?? 0;
  if (tableCount < 65) throw new Error(`Expected at least 65 D1 tables after bootstrap; found ${tableCount}`);

  const canonical = run([
    "d1", "execute", "ca-progress-v2-phase2-local", "--local", "--persist-to", persistTo,
    "--command", "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('academic_catalog_nodes','academic_catalog_version_items','academic_catalog_aliases','academic_catalog_lineage','chapter_progress','progress_events','mentor_model_versions','mentor_personalization_eligibility','payment_events') ORDER BY name;",
    "--json",
  ]);
  const names = JSON.parse(canonical)?.[0]?.results?.map((row) => row.name) ?? [];
  const required = ["academic_catalog_aliases","academic_catalog_lineage","academic_catalog_nodes","academic_catalog_version_items","chapter_progress","mentor_model_versions","mentor_personalization_eligibility","payment_events","progress_events"];
  for (const name of required) if (!names.includes(name)) throw new Error(`Missing D1 table ${name}`);

  const fk = run([
    "d1", "execute", "ca-progress-v2-phase2-local", "--local", "--persist-to", persistTo,
    "--command", "PRAGMA foreign_key_check;",
    "--json",
  ]);
  const fkRows = JSON.parse(fk)?.[0]?.results ?? [];
  if (fkRows.length) throw new Error(`D1 foreign_key_check returned ${fkRows.length} violations`);

  // Re-apply proves migration tracking / idempotent no-op behavior on the same local database.
  run(["d1", "migrations", "apply", "ca-progress-v2-phase2-local", "--local", "--persist-to", persistTo]);
  console.log(`Phase 2 D1 bootstrap PASS (${tableCount} tables, clean FK check, repeat apply clean).`);
} finally {
  rmSync(persistTo, { recursive: true, force: true });
}
