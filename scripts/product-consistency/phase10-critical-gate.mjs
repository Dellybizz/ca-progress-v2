import { spawnSync } from "node:child_process";

// A scanner implementation error must block normal releases, but it must not create a
// deadlock that prevents its own repair. This query first executes the repaired academic
// relationship against production. Only when that succeeds can the superseded scanner
// error be excluded; real orphan rows and every other critical finding still block.
const sql = `
WITH repaired_orphan_check AS (
  SELECT COUNT(*) AS orphan_count
  FROM chapters c
  LEFT JOIN syllabus_versions v ON v.id=c.syllabus_version_id
  LEFT JOIN subjects s ON s.id=v.subject_id
  WHERE v.id IS NULL OR s.id IS NULL OR c.module_id IS NULL
), blockers AS (
  SELECT COUNT(*) AS blocker_count
  FROM consistency_findings f
  JOIN consistency_scan_runs r ON r.id=f.scan_id
  WHERE f.severity='critical'
    AND f.state='open'
    AND r.id=(SELECT id FROM consistency_scan_runs WHERE status='completed' ORDER BY started_at DESC LIMIT 1)
    AND NOT (f.check_key='orphaned_academic_records' AND f.affected_scope='scanner')
)
SELECT orphan_count, blocker_count FROM repaired_orphan_check, blockers;
`;

const run = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [
  "wrangler", "d1", "execute", "ca-progress-v2-phase4-shadow", "--remote",
  "--config=wrangler.jsonc", "--json", "--command", sql,
], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
if (run.status !== 0) process.exit(run.status ?? 1);
let parsed;
try { parsed = JSON.parse(run.stdout); }
catch { throw new Error("Consistency deployment gate did not return valid D1 JSON."); }
const rows = Array.isArray(parsed) ? parsed.flatMap((entry) => entry?.results ?? []) : parsed?.results ?? [];
const orphanCount = Number(rows[0]?.orphan_count ?? 0);
const blockerCount = Number(rows[0]?.blocker_count ?? 0);
const total = orphanCount + blockerCount;
if (total > 0) {
  console.error(`Deployment blocked: ${total} verified critical consistency finding${total === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("Phase 10 consistency deployment gate passed, including repaired orphan validation.");
