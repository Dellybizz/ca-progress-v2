import { readFileSync } from "node:fs";

const bookmark = JSON.parse(readFileSync(process.argv[2], "utf8"));
const raw = JSON.parse(readFileSync(process.argv[3], "utf8"));
if (!JSON.stringify(bookmark).includes('bookmark')) throw new Error('D1 recovery bookmark missing');
const statements = Array.isArray(raw) ? raw : [raw];
if (statements.length !== 27 || statements.some(item => item.success !== true || !Array.isArray(item.results))) {
  throw new Error(`D1 audit incomplete: expected 27 successful statements, received ${statements.length}`);
}
if (statements[0].results.length) throw new Error('D1 foreign key violations found');
const rows = statements.slice(1).flatMap(item => item.results);
const metrics = Object.fromEntries(rows.filter(row => row.metric).map(row => [row.metric, Number(row.value)]));
const findings = rows.filter(row => row.finding && Number(row.value) !== 0);
if (Object.keys(metrics).length !== 20 || findings.length) {
  throw new Error(`D1 baseline failed: ${JSON.stringify(findings)}`);
}
if (metrics.profiles > metrics.app_users || metrics.active_users > metrics.app_users) {
  throw new Error('Account counts are inconsistent');
}
console.log(`Authentication Phase 0 passed: ${metrics.app_users} users; ${metrics.auth_identities} identities; ${metrics.password_migration_applied ? 'password schema present' : 'password schema absent'}.`);
