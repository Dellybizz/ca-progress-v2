import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { canUseExport, exportProductPlanLabel, exportRequirement } from "../lib/exports/policy.mjs";
import { fetchOwnedProgressData } from "../lib/exports/progress-data.mjs";
import { buildProgressPdf } from "../lib/exports/progress-pdf.mjs";

function fakeProgressDb(profileRows, progressRows) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          const owner = values[0];
          return {
            async first() {
              if (/FROM profiles/.test(sql)) return profileRows.find((row) => row.user_id === owner) ?? null;
              throw new Error(`Unexpected first() SQL: ${sql}`);
            },
            async all() {
              if (/FROM chapter_progress/.test(sql)) return { results: progressRows.filter((row) => row.user_id === owner) };
              throw new Error(`Unexpected all() SQL: ${sql}`);
            },
          };
        },
      };
    },
  };
}

test("Phase 14.1 maps internal billing tiers to product plans without weakening the matrix", () => {
  assert.equal(exportProductPlanLabel("free"), "Free");
  assert.equal(exportProductPlanLabel("basic"), "Pro");
  assert.equal(exportProductPlanLabel("pro"), "Premium");
  assert.deepEqual(exportRequirement("progress_pdf"), { tier: "free", productPlan: "Free" });
  assert.deepEqual(exportRequirement("study_csv"), { tier: "basic", productPlan: "Pro" });
  assert.deepEqual(exportRequirement("test_history_csv"), { tier: "basic", productPlan: "Pro" });
  assert.deepEqual(exportRequirement("full_backup"), { tier: "pro", productPlan: "Premium" });
  assert.equal(canUseExport("free", "progress_pdf"), true);
  assert.equal(canUseExport("free", "study_csv"), false);
  assert.equal(canUseExport("basic", "study_csv"), true);
  assert.equal(canUseExport("basic", "test_history_csv"), true);
  assert.equal(canUseExport("basic", "full_backup"), false);
  assert.equal(canUseExport("pro", "full_backup"), true);
});

test("Progress PDF is valid for an empty account", () => {
  const pdf = buildProgressPdf({ profile: { displayName: "Empty Student" }, rows: [] });
  assert.ok(pdf instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), "%PDF-1.4");
  assert.match(new TextDecoder().decode(pdf), /No saved chapter progress yet\./);
});

test("Progress PDF bytes are deterministic even when input rows arrive in a different order", () => {
  const rows = [
    { chapterId: "b", chapterNumber: 2, chapterTitle: "B", subjectTitle: "Subject", levelTitle: "Level", completedAt: null, revision1At: null, revision2At: null, test1At: null, test2At: null },
    { chapterId: "a", chapterNumber: 1, chapterTitle: "A", subjectTitle: "Subject", levelTitle: "Level", completedAt: "2026-01-01T00:00:00.000Z", revision1At: null, revision2At: null, test1At: null, test2At: null },
  ];
  const profile = { displayName: "Student", caLevel: "Intermediate", groupChoice: "both", attemptKey: "may-2027" };
  const first = buildProgressPdf({ profile, rows });
  const second = buildProgressPdf({ profile, rows: [...rows].reverse() });
  assert.deepEqual(first, second);
});

test("Progress PDF safely escapes PDF control characters in user-facing text", () => {
  const pdf = new TextDecoder().decode(buildProgressPdf({
    profile: { displayName: "A (B) \\ C", caLevel: "Final", groupChoice: null, attemptKey: null },
    rows: [],
  }));
  assert.ok(pdf.includes("A \\(B\\) \\\\ C"));
});

test("owned progress queries bind the authenticated owner to every private table read", async () => {
  const db = fakeProgressDb(
    [{ user_id: "owner-1", display_name: "Owner", ca_level: "Intermediate", group_choice: "both", attempt_key: "may-2027" }],
    [{ user_id: "owner-1", chapter_id: "chapter-1", chapter_number: 1, chapter_title: "Accounting", subject_title: "Accounting", level_title: "Intermediate", completed_at: null, revision_1_at: null, revision_2_at: null, test_1_at: null, test_2_at: null }],
  );
  const result = await fetchOwnedProgressData(db, "owner-1");
  assert.equal(result.profile.display_name, "Owner");
  assert.equal(result.rows.length, 1);
});

test("a different authenticated owner cannot receive another user's rows", async () => {
  const db = fakeProgressDb(
    [{ user_id: "owner-1", display_name: "Owner", ca_level: "Intermediate", group_choice: "both", attempt_key: "may-2027" }],
    [{ user_id: "owner-1", chapter_id: "chapter-secret", chapter_number: 99, chapter_title: "Secret", subject_title: "Secret", level_title: "Intermediate", completed_at: null, revision_1_at: null, revision_2_at: null, test_1_at: null, test_2_at: null }],
  );
  const result = await fetchOwnedProgressData(db, "owner-2");
  assert.equal(result.profile, null);
  assert.deepEqual(result.rows, []);
});

test("progress export refuses a missing authenticated owner id", async () => {
  await assert.rejects(() => fetchOwnedProgressData(fakeProgressDb([], []), ""), /Authenticated user id is required/);
});

test("Progress PDF route derives ownership from session and returns private attachment headers", () => {
  const route = fs.readFileSync("app/api/exports/progress/route.ts", "utf8");
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /const user = await optionalUser\(\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /createOwnedProgressPdf\(user\.id\)/);
  assert.match(route, /private, no-store/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /application\/pdf/);
  assert.doesNotMatch(route, /searchParams|request\.url|request\.json|userId/);
});

test("Phase 14.1 export surfaces remain R2-free after later Phase 14 additions", () => {
  const paths = [
    "lib/exports/policy.mjs",
    "lib/exports/progress-data.mjs",
    "lib/exports/progress-pdf.mjs",
    "lib/exports/csv.mjs",
    "lib/exports/study-data.mjs",
    "lib/exports/test-history-data.mjs",
    "app/api/exports/progress/route.ts",
    "app/api/exports/study/route.ts",
    "app/api/exports/tests/route.ts",
  ];
  const source = paths.map((path) => fs.readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /bucket_name|bucketName|object_key|objectKey|signed[_-]?url|presign|R2_BUCKET|\.r2\./i);
  assert.equal(fs.existsSync("app/api/exports/study/route.ts"), true);
  assert.equal(fs.existsSync("app/api/exports/tests/route.ts"), true);
});
