import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  fetchOwnedProgressData,
  OWNED_PROGRESS_PROFILE_SQL,
  OWNED_PROGRESS_ROWS_SQL,
} from "../lib/exports/progress-data.mjs";

function fakeDb() {
  const binds = [];
  return {
    binds,
    prepare(sql) {
      return {
        bind(...values) {
          binds.push({ sql, values });
          const userId = values[0];
          return {
            async first() {
              if (sql === OWNED_PROGRESS_PROFILE_SQL && userId === "owner-1") {
                return { display_name: "Owner", ca_level: "foundation", group_choice: null, attempt_key: "may-2027" };
              }
              return null;
            },
            async all() {
              if (sql === OWNED_PROGRESS_ROWS_SQL && userId === "owner-1") {
                return { results: [{ chapter_id: "owned-chapter", chapter_number: "1", chapter_title: "Owned", subject_title: "Accounting", level_title: "Foundation", completed_at: null, revision_1_at: null, revision_2_at: null, test_1_at: null, test_2_at: null }] };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

test("owned progress queries bind the authenticated owner to every private table read", async () => {
  assert.match(OWNED_PROGRESS_PROFILE_SQL, /profiles WHERE user_id=\?1/);
  assert.match(OWNED_PROGRESS_ROWS_SQL, /WHERE cp\.user_id=\?1/);
  assert.match(OWNED_PROGRESS_ROWS_SQL, /ORDER BY[\s\S]*c\.id ASC/);

  const db = fakeDb();
  const result = await fetchOwnedProgressData(db, "owner-1");
  assert.equal(result.profile.display_name, "Owner");
  assert.equal(result.rows.length, 1);
  assert.deepEqual(db.binds.map((entry) => entry.values), [["owner-1"], ["owner-1"]]);
});

test("a different authenticated owner cannot receive another user's rows", async () => {
  const db = fakeDb();
  const result = await fetchOwnedProgressData(db, "owner-2");
  assert.equal(result.profile, null);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(db.binds.map((entry) => entry.values), [["owner-2"], ["owner-2"]]);
});

test("progress export refuses a missing authenticated owner id", async () => {
  await assert.rejects(() => fetchOwnedProgressData(fakeDb(), ""), /Authenticated user id is required/);
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

test("export implementation exposes no R2 internals and does not start Phase 14.3", () => {
  const paths = [
    "lib/exports/policy.mjs",
    "lib/exports/progress-data.mjs",
    "lib/exports/progress-pdf.mjs",
    "lib/exports/csv.mjs",
    "lib/exports/study-data.mjs",
    "lib/exports/test-history-data.mjs",
    "lib/exports/service.ts",
    "app/api/exports/progress/route.ts",
    "app/api/exports/study/route.ts",
    "app/api/exports/tests/route.ts",
  ];
  const source = paths.map((path) => fs.readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /bucket_name|bucketName|object_key|objectKey|signed[_-]?url|presign|R2_BUCKET|\.r2\./i);
  assert.equal(fs.existsSync("app/api/exports/study/route.ts"), true);
  assert.equal(fs.existsSync("app/api/exports/tests/route.ts"), true);
  assert.equal(fs.existsSync("app/api/exports/backup/route.ts"), false);
});
