import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 3D keeps the data page focused on student-visible content and review work", () => {
  const page = read("components/icai/admin-sync-data.tsx");
  for (const label of ["Content filters", "Exam dates and countdown sources", "Approve", "Reject", "Possible duplicate groups", "What students currently see"]) assert.match(page, new RegExp(label, "i"));
  assert.match(page, /name="level"/);
  assert.match(page, /name="attempt"/);
  assert.match(page, /name="subject"/);
  assert.match(page, /name="type"/);
  assert.match(page, /ICAI_RESOURCE_TYPES/);
  assert.match(page, /Technical evidence|Official source evidence and availability/);
  assert.doesNotMatch(page, /runTargetedIcaiSyncAction/);
  assert.doesNotMatch(page, /controlIcaiSyncAction/);
});

test("Phase 3D filters the shared verified catalog at the server boundary", () => {
  const route = read("app/(admin)/admin/icai-sync/data/page.tsx");
  const query = read("lib/icai/query.ts");
  assert.match(route, /getIcaiPublicCatalog\(filters\)/);
  assert.match(route, /type: param\(params\.type\)/);
  assert.match(query, /selected\.level/);
  assert.match(query, /selected\.attempt/);
  assert.match(query, /selected\.subject/);
  assert.match(query, /selected\.type/);
  assert.match(query, /sourceUrl: row\.source_url/);
});
