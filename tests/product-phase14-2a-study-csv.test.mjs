import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { canUseExport } from "../lib/exports/policy.mjs";
import {
  encodeCsvCell,
  encodeCsvRow,
  neutralizeCsvFormula,
} from "../lib/exports/csv.mjs";
import {
  generateOwnedStudyCsvChunks,
  OWNED_STUDY_FIRST_PAGE_SQL,
  OWNED_STUDY_NEXT_PAGE_SQL,
  STUDY_CSV_COLUMNS,
  STUDY_EXPORT_BATCH_SIZE,
} from "../lib/exports/study-data.mjs";

function studyRow(index, overrides = {}) {
  const startedAt = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  const endedAt = new Date(Date.parse(startedAt) + 30 * 60_000).toISOString();
  return {
    user_id: "owner-1",
    session_id: `session-${String(index).padStart(5, "0")}`,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: 1800,
    mode: "focus",
    timezone: "Asia/Kolkata",
    subject_id: "subject-accounting",
    subject_title: "Accounting",
    chapter_id: "chapter-1",
    chapter_title: "Accounting Process",
    focus_target_seconds: 1500,
    break_target_seconds: 300,
    task_id: null,
    plan_item_id: null,
    intended_task_title: null,
    pause_count: 0,
    paused_seconds: 0,
    completion_state: "completed",
    understanding_score: null,
    focus_rating: null,
    reflection_saved_at: null,
    created_at: startedAt,
    ...overrides,
  };
}

function fakeStudyDb(sourceRows) {
  const binds = [];
  return {
    binds,
    prepare(sql) {
      assert.ok(sql === OWNED_STUDY_FIRST_PAGE_SQL || sql === OWNED_STUDY_NEXT_PAGE_SQL);
      return {
        bind(...values) {
          binds.push({ sql, values });
          return {
            async all() {
              const userId = values[0];
              const limit = sql === OWNED_STUDY_FIRST_PAGE_SQL ? values[1] : values[3];
              let rows = sourceRows
                .filter((row) => row.user_id === userId)
                .sort((a, b) => a.started_at.localeCompare(b.started_at) || a.session_id.localeCompare(b.session_id));
              if (sql === OWNED_STUDY_NEXT_PAGE_SQL) {
                const startedAt = values[1];
                const id = values[2];
                rows = rows.filter((row) => row.started_at > startedAt || (row.started_at === startedAt && row.session_id > id));
              }
              return {
                results: rows.slice(0, limit).map((row) => {
                  const copy = { ...row };
                  delete copy.user_id;
                  return copy;
                }),
              };
            },
          };
        },
      };
    },
  };
}

async function collectCsv(db, userId, options) {
  let csv = "";
  for await (const chunk of generateOwnedStudyCsvChunks(db, userId, options)) csv += chunk;
  return csv;
}

function exportedSessionIds(csv) {
  return csv.trimEnd().split("\r\n").slice(1).map((line) => line.split(",", 1)[0]);
}

test("Phase 14.2A CSV encoder escapes RFC-style delimiters and neutralizes spreadsheet formulas", () => {
  assert.equal(encodeCsvCell("Accounting, Advanced"), '"Accounting, Advanced"');
  assert.equal(encodeCsvCell('He said "focus"'), '"He said ""focus"""');
  assert.equal(encodeCsvCell("line one\nline two"), '"line one\nline two"');

  for (const payload of ["=2+2", "+cmd", "-cmd", "@SUM(A1:A2)", "  =HYPERLINK(\"x\")"]) {
    assert.equal(neutralizeCsvFormula(payload), `'${payload}`);
  }
  assert.equal(neutralizeCsvFormula("safe text"), "safe text");

  const unicode = "लेखा अध्ययन 💡";
  assert.equal(new TextDecoder().decode(new TextEncoder().encode(encodeCsvCell(unicode))), unicode);
});

test("Study CSV has a deterministic column contract and a valid zero-record export", async () => {
  assert.equal(STUDY_EXPORT_BATCH_SIZE, 500);
  assert.equal(
    encodeCsvRow(STUDY_CSV_COLUMNS),
    "session_id,started_at,ended_at,duration_seconds,mode,timezone,subject_id,subject_title,chapter_id,chapter_title,focus_target_seconds,break_target_seconds,task_id,plan_item_id,intended_task_title,pause_count,paused_seconds,completion_state,understanding_score,focus_rating,reflection_saved_at,created_at",
  );

  const db = fakeStudyDb([]);
  const csv = await collectCsv(db, "owner-1");
  assert.equal(csv, `${encodeCsvRow(STUDY_CSV_COLUMNS)}\r\n`);
  assert.deepEqual(db.binds.map((entry) => entry.values), [["owner-1", 500]]);
});

test("Study export SQL keeps every page requester-owned, stable, and offset-free", () => {
  for (const sql of [OWNED_STUDY_FIRST_PAGE_SQL, OWNED_STUDY_NEXT_PAGE_SQL]) {
    assert.match(sql, /WHERE s\.user_id=\?1/);
    assert.match(sql, /ORDER BY s\.started_at ASC,s\.id ASC/);
    assert.doesNotMatch(sql, /\bOFFSET\b/i);
  }
  assert.match(OWNED_STUDY_NEXT_PAGE_SQL, /s\.started_at>\?2/);
  assert.match(OWNED_STUDY_NEXT_PAGE_SQL, /s\.id>\?3/);
  assert.match(OWNED_STUDY_FIRST_PAGE_SQL, /x\.user_id=s\.user_id/);
  assert.match(OWNED_STUDY_FIRST_PAGE_SQL, /t\.user_id=s\.user_id/);
  assert.match(OWNED_STUDY_FIRST_PAGE_SQL, /dpi\.user_id=s\.user_id/);
});

test("Study CSV never leaks another user's sessions and crosses equal-time batch boundaries without duplicates", async () => {
  const sharedTime = "2026-01-05T10:00:00.000Z";
  const rows = [
    studyRow(0, { session_id: "session-00000" }),
    studyRow(1, { session_id: "session-a", started_at: sharedTime, ended_at: "2026-01-05T10:30:00.000Z" }),
    studyRow(1, { session_id: "session-b", started_at: sharedTime, ended_at: "2026-01-05T10:31:00.000Z" }),
    studyRow(3, { session_id: "session-z" }),
    studyRow(2, { user_id: "owner-2", session_id: "other-user-secret", subject_title: "Private Other User" }),
  ];
  const db = fakeStudyDb(rows);
  const csv = await collectCsv(db, "owner-1", { batchSize: 2 });
  const ids = exportedSessionIds(csv);

  assert.deepEqual(ids, ["session-00000", "session-z", "session-a", "session-b"]);
  assert.equal(new Set(ids).size, 4);
  assert.doesNotMatch(csv, /other-user-secret|Private Other User/);
  assert.ok(db.binds.length >= 2);
  assert.ok(db.binds.every((entry) => entry.values[0] === "owner-1"));
});

test("Study CSV paginates thousands of sessions with no omissions or duplicates", async () => {
  const rows = Array.from({ length: 2505 }, (_, index) => studyRow(index));
  const db = fakeStudyDb(rows);
  const csv = await collectCsv(db, "owner-1");
  const ids = exportedSessionIds(csv);

  assert.equal(ids.length, 2505);
  assert.equal(new Set(ids).size, 2505);
  assert.equal(ids[0], "session-00000");
  assert.equal(ids.at(-1), "session-02504");
  assert.equal(db.binds.length, 6);
  assert.ok(db.binds.every((entry) => entry.values.at(-1) === 500));
});

test("Study export clamps oversized batches and rejects a missing authenticated owner", async () => {
  const db = fakeStudyDb([studyRow(0)]);
  await collectCsv(db, "owner-1", { batchSize: 50_000 });
  assert.equal(db.binds[0].values.at(-1), 1000);

  await assert.rejects(() => collectCsv(fakeStudyDb([]), ""), /Authenticated user id is required/);
});

test("Study CSV output is reproducible regardless of source row arrival order", async () => {
  const rows = Array.from({ length: 23 }, (_, index) => studyRow(index));
  const shuffled = [...rows].reverse();
  const first = await collectCsv(fakeStudyDb(rows), "owner-1", { batchSize: 7 });
  const second = await collectCsv(fakeStudyDb(shuffled), "owner-1", { batchSize: 7 });
  assert.equal(first, second);
});

test("Study CSV entitlement and route enforce Pro/Premium access from session identity only", () => {
  assert.equal(canUseExport("free", "study_csv"), false);
  assert.equal(canUseExport("basic", "study_csv"), true);
  assert.equal(canUseExport("pro", "study_csv"), true);

  const route = fs.readFileSync("app/api/exports/study/route.ts", "utf8");
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /const user = await optionalUser\(\)/);
  assert.match(route, /canUseExport\(tier, "study_csv"\)/);
  assert.match(route, /createOwnedStudyCsvStream\(user\.id\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.match(route, /text\/csv; charset=utf-8/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /searchParams|request\.url|request\.json|userId/);
});
