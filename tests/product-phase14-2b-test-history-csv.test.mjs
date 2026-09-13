import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { encodeCsvCell } from "../lib/exports/csv.mjs";
import { canUseExport } from "../lib/exports/policy.mjs";
import {
  buildOwnedTestAttachmentsSql,
  buildOwnedTestMistakesSql,
  fetchOwnedTestHistoryPage,
  generateOwnedTestHistoryCsvChunks,
  OWNED_TEST_HISTORY_FIRST_PAGE_SQL,
  OWNED_TEST_HISTORY_NEXT_PAGE_SQL,
  TEST_HISTORY_CSV_COLUMNS,
  TEST_HISTORY_EXPORT_BATCH_SIZE,
  TEST_HISTORY_EXPORT_MAX_BATCH_SIZE,
} from "../lib/exports/test-history-data.mjs";

function attemptRow(index, overrides = {}) {
  const completedAt = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    user_id: "owner-1",
    attempt_id: `attempt-${String(index).padStart(5, "0")}`,
    subject_id: "subject-accounting",
    subject_title: "Accounting",
    chapter_id: "chapter-1",
    chapter_number: "1",
    chapter_title: "Accounting Process",
    test_stage: "test_1",
    attempt_number: index + 1,
    marks_scored: 72,
    marks_total: 100,
    percentage: 72,
    duration_minutes: 60,
    completed_at: completedAt,
    created_at: completedAt,
    ...overrides,
  };
}

function mistakeRow(attemptId, index, overrides = {}) {
  return {
    user_id: "owner-1",
    id: `mistake-${attemptId}-${index}`,
    attempt_id: attemptId,
    category: "conceptual",
    note: `Review concept ${index}`,
    created_at: new Date(Date.UTC(2026, 1, 1, 0, index)).toISOString(),
    ...overrides,
  };
}

function attachmentRow(attemptId, index, overrides = {}) {
  return {
    user_id: "owner-1",
    id: `attachment-${attemptId}-${index}`,
    attempt_id: attemptId,
    attachment_kind: "checked_paper",
    filename: `checked-${index}.pdf`,
    mime_type: "application/pdf",
    size_bytes: 2048,
    created_at: new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString(),
    ...overrides,
  };
}

function compareAttemptRows(a, b) {
  return a.completed_at.localeCompare(b.completed_at) || a.attempt_id.localeCompare(b.attempt_id);
}

function comparePartRows(a, b) {
  return a.attempt_id.localeCompare(b.attempt_id)
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id);
}

function fakeTestDb({ attempts, mistakes = [], attachments = [] }) {
  const binds = [];
  return {
    binds,
    prepare(sql) {
      return {
        bind(...values) {
          binds.push({ sql, values });
          return {
            async all() {
              const userId = values[0];
              if (sql === OWNED_TEST_HISTORY_FIRST_PAGE_SQL || sql === OWNED_TEST_HISTORY_NEXT_PAGE_SQL) {
                const limit = sql === OWNED_TEST_HISTORY_FIRST_PAGE_SQL ? values[1] : values[3];
                let rows = attempts.filter((row) => row.user_id === userId).sort(compareAttemptRows);
                if (sql === OWNED_TEST_HISTORY_NEXT_PAGE_SQL) {
                  const completedAt = values[1];
                  const id = values[2];
                  rows = rows.filter((row) => row.completed_at > completedAt || (row.completed_at === completedAt && row.attempt_id > id));
                }
                return { results: rows.slice(0, limit) };
              }

              const attemptIds = new Set(values.slice(1));
              if (sql.includes("FROM test_attempt_mistakes")) {
                return { results: mistakes.filter((row) => row.user_id === userId && attemptIds.has(row.attempt_id)).sort(comparePartRows) };
              }
              if (sql.includes("FROM test_attempt_attachments")) {
                return { results: attachments.filter((row) => row.user_id === userId && attemptIds.has(row.attempt_id)).sort(comparePartRows) };
              }
              throw new Error(`Unexpected SQL in test DB: ${sql}`);
            },
          };
        },
      };
    },
  };
}

async function collectCsv(db, userId = "owner-1", options = {}) {
  let csv = "";
  for await (const chunk of generateOwnedTestHistoryCsvChunks(db, userId, options)) csv += chunk;
  return csv;
}

function csvLines(csv) {
  return csv.endsWith("\r\n") ? csv.slice(0, -2).split("\r\n") : csv.split("\r\n");
}

test("Phase 14.2B keeps Test History CSV on Pro and inherited Premium entitlement", () => {
  assert.equal(canUseExport("free", "test_history_csv"), false);
  assert.equal(canUseExport("basic", "test_history_csv"), true);
  assert.equal(canUseExport("pro", "test_history_csv"), true);
});

test("Test History export SQL is requester-owned, keyset-paginated, bounded, and excludes storage internals", () => {
  assert.equal(TEST_HISTORY_EXPORT_BATCH_SIZE, 250);
  assert.equal(TEST_HISTORY_EXPORT_MAX_BATCH_SIZE, 500);
  assert.match(OWNED_TEST_HISTORY_FIRST_PAGE_SQL, /WHERE a\.user_id=\?1/);
  assert.match(OWNED_TEST_HISTORY_FIRST_PAGE_SQL, /ORDER BY a\.completed_at ASC,a\.id ASC/);
  assert.match(OWNED_TEST_HISTORY_NEXT_PAGE_SQL, /a\.completed_at>\?2[\s\S]*a\.id>\?3/);
  assert.doesNotMatch(`${OWNED_TEST_HISTORY_FIRST_PAGE_SQL}\n${OWNED_TEST_HISTORY_NEXT_PAGE_SQL}`, /OFFSET/i);

  const mistakesSql = buildOwnedTestMistakesSql(3);
  const attachmentsSql = buildOwnedTestAttachmentsSql(3);
  assert.match(mistakesSql, /WHERE user_id=\?1 AND attempt_id IN \(\?2,\?3,\?4\)/);
  assert.match(attachmentsSql, /WHERE user_id=\?1 AND attempt_id IN \(\?2,\?3,\?4\)/);
  assert.match(mistakesSql, /ORDER BY attempt_id ASC,created_at ASC,id ASC/);
  assert.match(attachmentsSql, /ORDER BY attempt_id ASC,created_at ASC,id ASC/);
  assert.doesNotMatch(attachmentsSql, /object_key|upload_intent|presign|signed[_-]?url/i);
});

test("zero-record Test History export is a valid deterministic CSV with only the header", async () => {
  const csv = await collectCsv(fakeTestDb({ attempts: [] }));
  assert.equal(csv, `${TEST_HISTORY_CSV_COLUMNS.join(",")}\r\n`);
});

test("thousands of test attempts cross every batch boundary with no omission or duplicate", async () => {
  const attempts = Array.from({ length: 2505 }, (_, index) => attemptRow(index));
  const db = fakeTestDb({ attempts });
  const csv = await collectCsv(db, "owner-1", { batchSize: 250 });
  const lines = csvLines(csv);
  assert.equal(lines.length, 2506);
  assert.equal(lines[0], TEST_HISTORY_CSV_COLUMNS.join(","));

  const ids = lines.slice(1).map((line) => line.split(",", 1)[0]);
  assert.equal(ids.length, 2505);
  assert.equal(new Set(ids).size, 2505);
  assert.deepEqual(ids, attempts.map((row) => row.attempt_id));

  const mainReads = db.binds.filter((entry) => entry.sql === OWNED_TEST_HISTORY_FIRST_PAGE_SQL || entry.sql === OWNED_TEST_HISTORY_NEXT_PAGE_SQL);
  assert.equal(mainReads.length, 11);
  assert.ok(mainReads.every((entry) => entry.values[0] === "owner-1"));
});

test("equal completion timestamps remain lossless across a keyset boundary", async () => {
  const sameTime = "2026-06-01T12:00:00.000Z";
  const attempts = [
    attemptRow(0, { attempt_id: "attempt-a", completed_at: sameTime }),
    attemptRow(1, { attempt_id: "attempt-b", completed_at: sameTime }),
    attemptRow(2, { attempt_id: "attempt-c", completed_at: sameTime }),
  ];
  const csv = await collectCsv(fakeTestDb({ attempts }), "owner-1", { batchSize: 2 });
  const ids = csvLines(csv).slice(1).map((line) => line.split(",", 1)[0]);
  assert.deepEqual(ids, ["attempt-a", "attempt-b", "attempt-c"]);
});

test("attempts, Mistake Journal rows, and attachment metadata never cross the authenticated owner boundary", async () => {
  const owned = attemptRow(0, { attempt_id: "owned-attempt" });
  const outsider = attemptRow(1, { user_id: "owner-2", attempt_id: "outsider-attempt", chapter_title: "PRIVATE OUTSIDER CHAPTER" });
  const mistakes = [
    mistakeRow("owned-attempt", 0, { note: "Owned note" }),
    mistakeRow("owned-attempt", 1, { user_id: "owner-2", note: "PRIVATE LEAK NOTE" }),
    mistakeRow("outsider-attempt", 2, { user_id: "owner-2", note: "PRIVATE OUTSIDER NOTE" }),
  ];
  const attachments = [
    attachmentRow("owned-attempt", 0, { filename: "owned.pdf" }),
    attachmentRow("owned-attempt", 1, { user_id: "owner-2", filename: "private-leak.pdf" }),
    attachmentRow("outsider-attempt", 2, { user_id: "owner-2", filename: "private-outsider.pdf" }),
  ];
  const db = fakeTestDb({ attempts: [outsider, owned], mistakes, attachments });
  const csv = await collectCsv(db);

  assert.match(csv, /owned-attempt/);
  assert.match(csv, /Owned note/);
  assert.match(csv, /owned\.pdf/);
  assert.doesNotMatch(csv, /outsider-attempt|PRIVATE|private-leak|private-outsider/);
  assert.ok(db.binds.every((entry) => entry.values[0] === "owner-1"));
});

test("user-authored test fields remain UTF-8, CSV-safe, and formula-injection neutralized", async () => {
  const attempt = attemptRow(0, {
    attempt_id: "formula-attempt",
    subject_title: "=SUM(1,2)",
    chapter_title: "+cmd\n\"quoted\", chapter",
  });
  const mistakes = [mistakeRow("formula-attempt", 0, { note: "@danger,\nnext line" })];
  const attachments = [attachmentRow("formula-attempt", 0, { filename: "-payload,रिपोर्ट.csv" })];
  const csv = await collectCsv(fakeTestDb({ attempts: [attempt], mistakes, attachments }));

  assert.ok(csv.includes(encodeCsvCell("=SUM(1,2)")));
  assert.ok(csv.includes(encodeCsvCell("+cmd\n\"quoted\", chapter")));
  assert.ok(csv.includes(encodeCsvCell("@danger,\nnext line")));
  assert.ok(csv.includes(encodeCsvCell("-payload,रिपोर्ट.csv")));
  assert.match(csv, /रिपोर्ट/);
  assert.doesNotMatch(csv, /(^|,)[=+\-@]/m);
});

test("output is reproducible even if database source arrays arrive in different insertion order", async () => {
  const attempts = [attemptRow(0, { attempt_id: "attempt-a" }), attemptRow(1, { attempt_id: "attempt-b" })];
  const mistakes = [
    mistakeRow("attempt-b", 1, { category: "calculation", note: "Second" }),
    mistakeRow("attempt-b", 0, { category: "conceptual", note: "First" }),
  ];
  const attachments = [
    attachmentRow("attempt-a", 1, { filename: "b.pdf" }),
    attachmentRow("attempt-a", 0, { filename: "a.pdf" }),
  ];
  const first = await collectCsv(fakeTestDb({ attempts, mistakes, attachments }));
  const second = await collectCsv(fakeTestDb({ attempts: [...attempts].reverse(), mistakes: [...mistakes].reverse(), attachments: [...attachments].reverse() }));
  assert.equal(first, second);
});

test("oversized requested pages clamp before D1 detail reads", async () => {
  const attempts = Array.from({ length: 700 }, (_, index) => attemptRow(index));
  const db = fakeTestDb({ attempts });
  const page = await fetchOwnedTestHistoryPage(db, "owner-1", { batchSize: 50_000 });
  assert.equal(page.rows.length, TEST_HISTORY_EXPORT_MAX_BATCH_SIZE);
  assert.equal(db.binds[0].values.at(-1), TEST_HISTORY_EXPORT_MAX_BATCH_SIZE);
  assert.equal(db.binds[1].values.length, TEST_HISTORY_EXPORT_MAX_BATCH_SIZE + 1);
  assert.equal(db.binds[2].values.length, TEST_HISTORY_EXPORT_MAX_BATCH_SIZE + 1);
});

test("Test History export refuses a missing authenticated owner id", async () => {
  await assert.rejects(() => fetchOwnedTestHistoryPage(fakeTestDb({ attempts: [] }), ""), /Authenticated user id is required/);
});

test("Test History CSV route derives ownership only from session and returns a private UTF-8 attachment", () => {
  const route = fs.readFileSync("app/api/exports/tests/route.ts", "utf8");
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /const user = await optionalUser\(\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /canUseExport\(tier, "test_history_csv"\)/);
  assert.match(route, /createOwnedTestHistoryCsvStream\(user\.id\)/);
  assert.match(route, /private, no-store/);
  assert.match(route, /text\/csv; charset=utf-8/);
  assert.match(route, /Content-Disposition/);
  assert.doesNotMatch(route, /searchParams|request\.url|request\.json|userId/);
});

test("Phase 14.2B export source exposes no R2 object keys or upload-intent internals", () => {
  const source = [
    "lib/exports/test-history-data.mjs",
    "lib/exports/service.ts",
    "app/api/exports/tests/route.ts",
  ].map((path) => fs.readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /object_key|objectKey|test_attachment_upload_intents|bucket_name|bucketName|signed[_-]?url|presign|R2_BUCKET|\.r2\./i);
});
