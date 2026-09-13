import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { encodeCsvCell, neutralizeCsvFormula } from "../lib/exports/csv.mjs";
import { canUseExport } from "../lib/exports/policy.mjs";
import {
  OWNED_STUDY_FIRST_PAGE_SQL,
  OWNED_STUDY_NEXT_PAGE_SQL,
  STUDY_CSV_COLUMNS,
  STUDY_EXPORT_BATCH_SIZE,
  STUDY_EXPORT_MAX_BATCH_SIZE,
} from "../lib/exports/study-data.mjs";
import {
  OWNED_TEST_HISTORY_FIRST_PAGE_SQL,
  OWNED_TEST_HISTORY_NEXT_PAGE_SQL,
  TEST_HISTORY_CSV_COLUMNS,
  TEST_HISTORY_EXPORT_BATCH_SIZE,
  TEST_HISTORY_EXPORT_MAX_BATCH_SIZE,
} from "../lib/exports/test-history-data.mjs";

const STUDY_ROUTE = "app/api/exports/study/route.ts";
const TEST_ROUTE = "app/api/exports/tests/route.ts";
const SETTINGS_PAGE = "app/(student)/settings/page.tsx";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("Phase 14.2C locks the complete Free/Pro/Premium CSV entitlement matrix", () => {
  for (const kind of ["study_csv", "test_history_csv"]) {
    assert.equal(canUseExport("free", kind), false, `${kind} must stay unavailable on Free`);
    assert.equal(canUseExport("basic", kind), true, `${kind} must be available on product Pro`);
    assert.equal(canUseExport("pro", kind), true, `${kind} must be inherited by product Premium`);
  }

  assert.equal(canUseExport("free", "full_backup"), false);
  assert.equal(canUseExport("basic", "full_backup"), false);
  assert.equal(canUseExport("pro", "full_backup"), true);
});

test("both CSV contracts are deterministic, unique, and bounded for Worker-safe generation", () => {
  assert.equal(Object.isFrozen(STUDY_CSV_COLUMNS), true);
  assert.equal(Object.isFrozen(TEST_HISTORY_CSV_COLUMNS), true);
  assert.equal(new Set(STUDY_CSV_COLUMNS).size, STUDY_CSV_COLUMNS.length);
  assert.equal(new Set(TEST_HISTORY_CSV_COLUMNS).size, TEST_HISTORY_CSV_COLUMNS.length);

  assert.equal(STUDY_EXPORT_BATCH_SIZE, 500);
  assert.equal(STUDY_EXPORT_MAX_BATCH_SIZE, 1000);
  assert.ok(STUDY_EXPORT_BATCH_SIZE <= STUDY_EXPORT_MAX_BATCH_SIZE);

  assert.equal(TEST_HISTORY_EXPORT_BATCH_SIZE, 250);
  assert.equal(TEST_HISTORY_EXPORT_MAX_BATCH_SIZE, 500);
  assert.ok(TEST_HISTORY_EXPORT_BATCH_SIZE <= TEST_HISTORY_EXPORT_MAX_BATCH_SIZE);
});

test("both D1 export readers are requester-owned, keyset-paginated, stable, and OFFSET-free", () => {
  assert.match(OWNED_STUDY_FIRST_PAGE_SQL, /WHERE s\.user_id=\?1/);
  assert.match(OWNED_STUDY_FIRST_PAGE_SQL, /ORDER BY s\.started_at ASC,s\.id ASC/);
  assert.match(OWNED_STUDY_NEXT_PAGE_SQL, /s\.started_at>\?2[\s\S]*s\.id>\?3/);

  assert.match(OWNED_TEST_HISTORY_FIRST_PAGE_SQL, /WHERE a\.user_id=\?1/);
  assert.match(OWNED_TEST_HISTORY_FIRST_PAGE_SQL, /ORDER BY a\.completed_at ASC,a\.id ASC/);
  assert.match(OWNED_TEST_HISTORY_NEXT_PAGE_SQL, /a\.completed_at>\?2[\s\S]*a\.id>\?3/);

  for (const sql of [
    OWNED_STUDY_FIRST_PAGE_SQL,
    OWNED_STUDY_NEXT_PAGE_SQL,
    OWNED_TEST_HISTORY_FIRST_PAGE_SQL,
    OWNED_TEST_HISTORY_NEXT_PAGE_SQL,
  ]) {
    assert.doesNotMatch(sql, /\bOFFSET\b/i);
    assert.doesNotMatch(sql, /SELECT\s+\*/i);
  }
});

test("shared CSV encoding neutralizes spreadsheet formulas and safely preserves UTF-8 delimiters", () => {
  for (const payload of [
    "=2+2",
    "+cmd",
    "-cmd",
    "@SUM(A1:A2)",
    "  =HYPERLINK(\"https://invalid.example\")",
    "\t+cmd",
    "\r\n@SUM(A1:A2)",
  ]) {
    assert.equal(neutralizeCsvFormula(payload), `'${payload}`);
    assert.ok(encodeCsvCell(payload).includes("'"));
  }

  assert.equal(encodeCsvCell("Accounting, Advanced"), '"Accounting, Advanced"');
  assert.equal(encodeCsvCell('He said "focus"'), '"He said ""focus"""');
  assert.equal(encodeCsvCell("line one\nline two"), '"line one\nline two"');

  const unicode = "लेखा अध्ययन — परीक्षा इतिहास 💡";
  const encoded = new TextEncoder().encode(encodeCsvCell(unicode));
  assert.equal(new TextDecoder().decode(encoded), unicode);
});

test("both Pro CSV routes fail closed and bind export ownership only to the authenticated session", () => {
  const study = read(STUDY_ROUTE);
  const tests = read(TEST_ROUTE);

  for (const source of [study, tests]) {
    assert.match(source, /export async function GET\(\)/);
    assert.match(source, /const user = await optionalUser\(\)/);
    assert.match(source, /billing\.mode !== "ready"/);
    assert.match(source, /status: 401/);
    assert.match(source, /status: 403/);
    assert.match(source, /private, no-store/);
    assert.match(source, /Vary: "Cookie"/);
    assert.match(source, /Cross-Origin-Resource-Policy": "same-origin"/);
    assert.match(source, /X-Content-Type-Options": "nosniff"/);
    assert.match(source, /text\/csv; charset=utf-8/);
    assert.match(source, /Content-Disposition/);
    assert.doesNotMatch(source, /searchParams|request\.url|request\.json|userId/);
  }

  assert.match(study, /canUseExport\(tier, "study_csv"\)/);
  assert.match(study, /createOwnedStudyCsvStream\(user\.id\)/);
  assert.match(tests, /canUseExport\(tier, "test_history_csv"\)/);
  assert.match(tests, /createOwnedTestHistoryCsvStream\(user\.id\)/);
});

test("Settings keeps Pro CSV actions entitlement-gated while allowing later Premium additions", () => {
  const settings = read(SETTINGS_PAGE);
  assert.match(settings, /const billingReady = billing\.mode === "ready"/);
  assert.match(settings, /canUseExport\(tier, "study_csv"\)/);
  assert.match(settings, /canUseExport\(tier, "test_history_csv"\)/);
  assert.match(settings, /href="\/api\/exports\/study"/);
  assert.match(settings, /href="\/api\/exports\/tests"/);
});

test("Phase 14.2 CSV surface contains no R2 storage internals or arbitrary-owner inputs", () => {
  const source = [
    "lib/exports/csv.mjs",
    "lib/exports/study-data.mjs",
    "lib/exports/test-history-data.mjs",
    STUDY_ROUTE,
    TEST_ROUTE,
  ].map(read).join("\n");

  assert.doesNotMatch(source, /bucket_name|bucketName|object_key|objectKey|signed[_-]?url|presign|R2_BUCKET|\.r2\./i);
  assert.doesNotMatch(source, /test_attachment_upload_intents/i);
  assert.doesNotMatch(source, /searchParams|request\.url|request\.json/);
});
