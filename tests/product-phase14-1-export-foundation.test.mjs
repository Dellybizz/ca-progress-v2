import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseExport,
  exportProductPlanLabel,
  exportRequirement,
} from "../lib/exports/policy.mjs";
import { buildProgressPdf } from "../lib/exports/progress-pdf.mjs";

const decoder = new TextDecoder();

test("Phase 14.1 maps internal billing tiers to product plans without weakening the matrix", () => {
  assert.equal(exportProductPlanLabel("free"), "Free");
  assert.equal(exportProductPlanLabel("basic"), "Pro");
  assert.equal(exportProductPlanLabel("pro"), "Premium");

  assert.equal(canUseExport("free", "progress_pdf"), true);
  assert.equal(canUseExport("free", "study_csv"), false);
  assert.equal(canUseExport("free", "test_history_csv"), false);
  assert.equal(canUseExport("free", "full_backup"), false);

  assert.equal(canUseExport("basic", "progress_pdf"), true);
  assert.equal(canUseExport("basic", "study_csv"), true);
  assert.equal(canUseExport("basic", "test_history_csv"), true);
  assert.equal(canUseExport("basic", "full_backup"), false);

  assert.equal(canUseExport("pro", "progress_pdf"), true);
  assert.equal(canUseExport("pro", "study_csv"), true);
  assert.equal(canUseExport("pro", "test_history_csv"), true);
  assert.equal(canUseExport("pro", "full_backup"), true);
  assert.deepEqual(exportRequirement("full_backup"), { tier: "pro", productPlan: "Premium" });
});

test("Progress PDF is valid for an empty account", () => {
  const pdf = buildProgressPdf({ profile: { displayName: "Empty Student" }, rows: [] });
  const text = decoder.decode(pdf);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /No saved chapter progress yet\./);
  assert.match(text, /%%EOF\n$/);
});

test("Progress PDF bytes are deterministic even when input rows arrive in a different order", () => {
  const rowA = {
    chapterId: "chapter-a", chapterNumber: "1", chapterTitle: "Accounting Process", subjectTitle: "Accounting", levelTitle: "Foundation",
    completedAt: "2026-01-01T00:00:00Z", revision1At: null, revision2At: null, test1At: null, test2At: null,
  };
  const rowB = {
    chapterId: "chapter-b", chapterNumber: "2", chapterTitle: "Bank Reconciliation", subjectTitle: "Accounting", levelTitle: "Foundation",
    completedAt: "2026-01-02T00:00:00Z", revision1At: "2026-01-03T00:00:00Z", revision2At: null, test1At: null, test2At: null,
  };
  const first = buildProgressPdf({ profile: { displayName: "Student", caLevel: "foundation", attemptKey: "may-2027" }, rows: [rowB, rowA] });
  const second = buildProgressPdf({ profile: { displayName: "Student", caLevel: "foundation", attemptKey: "may-2027" }, rows: [rowA, rowB] });
  assert.deepEqual(first, second);
});

test("Progress PDF safely escapes PDF control characters in user-facing text", () => {
  const pdf = decoder.decode(buildProgressPdf({ profile: { displayName: "A (Student) \\ Test" }, rows: [] }));
  assert.ok(pdf.includes("A \\(Student\\) \\\\ Test"));
});
