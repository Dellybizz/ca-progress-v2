import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(file)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("Phase 8 exposes every required operator area without starting Phase 9 editing",()=>{
  const service=read("lib/admin/control-centre.ts");
  for(const key of ["system","academic","attempts","icai","resources","accounts","plans","community","notifications"])
    assert.match(service,new RegExp(`key: "${key}"`));
  assert.match(read("app/(admin)/admin/plans/page.tsx"),/Plan policy centre/);
});

test("Phase 8 configuration is versioned idempotent authorized and audited",()=>{
  const migration=read("d1/migrations/0045_product_consistency_phase8_admin_control.sql");
  const service=read("lib/admin/control-centre.ts");
  const actions=read("app/(admin)/admin/control/actions.ts");
  assert.match(migration,/admin_control_versions/);
  assert.match(migration,/admin_control_requests/);
  assert.match(migration,/append-only/);
  assert.match(service,/admin_audit_events/);
  assert.match(service,/db\.batch/);
  assert.match(actions,/requireAdminCapability\(area\.capability\)/);
  assert.match(service,/rollback_or_publish/);
});

test("Phase 8 keeps operator language clear and technical details progressive",()=>{
  const page=read("app/(admin)/admin/control/page.tsx");
  const jobs=read("app/(admin)/admin/jobs/page.tsx");
  assert.match(page,/Preview as student/);
  assert.match(page,/Search versions/);
  assert.match(page,/<details/);
  assert.doesNotMatch(jobs,/JSON\.stringify\(jobs/);
  assert.match(jobs,/Why this needs attention/);
});

test("Phase 8 deploy retains migration 0045",()=>{
  const runner=read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(runner,/0045_product_consistency_phase8_admin_control/);
  assert.match(runner,/BETWEEN '0012' AND '0047'/);
});
