import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("d1/migrations/0039_product_consistency_phase1_academic_model.sql");

test("Phase 1 adds modules without replacing stable academic IDs",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS academic_modules/);
  assert.match(migration,/ALTER TABLE chapters ADD COLUMN module_id/);
  assert.match(migration,/pre_consistency_v1/);
  assert.doesNotMatch(migration,/DELETE FROM (course_levels|course_groups|subjects|syllabus_versions|chapters)/);
});

test("Phase 1 maps all required content families through one registry",()=>{
  for(const kind of ["resource","icai_resource","test","progress","plan","notification","community"])
    assert.match(migration,new RegExp(`'${kind}'`));
  assert.match(migration,/academic_content_mappings/);
  assert.match(migration,/mapping_status/);
});

test("ambiguous content is quarantined and duplicates remain evidence-only",()=>{
  assert.match(migration,/academic_mapping_quarantine/);
  assert.match(migration,/academic_duplicate_candidates/);
  assert.match(migration,/No duplicate is merged or deleted automatically/);
  assert.match(read("lib/academic/consistency.ts"),/status='pending'/);
});

test("impossible hierarchy combinations are rejected in D1",()=>{
  for(const guard of ["subjects_level_group_guard","attempt_syllabus_scope_guard","chapter_module_scope_guard","academic_mapping_scope_guard"])
    assert.match(migration,new RegExp(guard));
  assert.match(migration,/syllabus_effective_range_guard/);
});

test("admin resolution is capability protected, validated, atomic and audited",()=>{
  const actions=read("app/(admin)/admin/syllabus/actions.ts");
  const service=read("lib/academic/consistency.ts");
  assert.match(actions,/requireAdminCapability\("academic\.edit"\)/);
  assert.match(service,/db\.batch/);
  assert.match(service,/academic\.quarantine\.resolve/);
  assert.match(service,/do not form one valid hierarchy/);
});

test("Phase 1 is retained in deployment and has read-only integrity certification",()=>{
  const retained=read("scripts/apply-retained-d1-migrations.mjs");
  const validator=read("scripts/validate-d1-hot-indexes.mjs");
  const integrity=read("scripts/product-consistency/phase1-integrity.sql");
  assert.match(retained,/0039_product_consistency_phase1_academic_model\.sql/);
  assert.match(retained,/BETWEEN '0012' AND '0046'/);
  assert.match(validator,/0039_product_consistency_phase1_academic_model\.sql/);
  assert.doesNotMatch(integrity,/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i);
});
