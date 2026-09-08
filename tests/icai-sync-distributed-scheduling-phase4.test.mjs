import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

async function loadScheduler() {
  const dir = mkdtempSync(join(tmpdir(), "ca-progress-icai-phase4-scheduler-"));
  const output = ts.transpileModule(read("lib/icai/scheduler.ts"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "scheduler.ts",
  }).outputText;
  const file = join(dir, "scheduler.mjs");
  writeFileSync(file, output);
  const scheduler = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
  return { scheduler, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function d1(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      let values = [];
      return {
        bind(...next) {
          values = next;
          return this;
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async run() {
          statement.run(...values);
          return { success: true };
        },
      };
    },
  };
}

function schedulerDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE _ca_schema_migrations(
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      source_freeze_commit TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE icai_sources(
      id TEXT PRIMARY KEY,
      name TEXT,
      source_type TEXT,
      level_codes TEXT,
      resource_types TEXT,
      trust_level TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE icai_sync_items(
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_eligible INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      started_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE icai_sync_runs(id TEXT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE background_jobs(id TEXT PRIMARY KEY,job_type TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE icai_source_controls(
      source_id TEXT PRIMARY KEY,
      paused_until TEXT,
      pause_reason TEXT,
      updated_by TEXT,
      updated_at TEXT
    );
    INSERT INTO icai_sources(id,name,source_type,level_codes,resource_types,trust_level,is_active) VALUES
      ('foundation','Foundation course','course_resource_hub','["foundation"]','["announcement"]','standard',1),
      ('intermediate','Intermediate course','course_resource_hub','["intermediate"]','["announcement"]','standard',1),
      ('exam-dates','Exam dates','exam_schedule','[]','["schedule"]','high_impact',1);
  `);
  db.exec(read("d1/migrations/0028_icai_sync_scheduling.sql"));
  return db;
}

test("Phase 4 scheduler dispatches only due work, caps windows, defers overlap, and keeps failures due", async () => {
  const { scheduler, cleanup } = await loadScheduler();
  const db = schedulerDb();
  const cloudDb = d1(db);
  try {
    const foundationWindow = await scheduler.selectIcaiScheduledDispatch(
      cloudDb,
      "2030-01-01T02:30:00.000Z",
    );
    assert.equal(foundationWindow.status, "dispatch");
    assert.equal(foundationWindow.window.key, "foundation");
    assert.ok(foundationWindow.sourceIds.includes("foundation"));
    assert.ok(foundationWindow.sourceIds.length <= 2, "a source window must never select more than two sources");
    assert.equal(foundationWindow.sourceIds.includes("intermediate"), false, "an unrelated not-selected group must not be fetched");

    const beforeSuccess = db.prepare("SELECT next_due_at FROM icai_source_schedule WHERE source_id='foundation'").get().next_due_at;
    await scheduler.recordIcaiSourceScheduleResult(cloudDb, "foundation", {
      success: true,
      completedAt: "2030-01-01T02:31:00.000Z",
      durationMs: 1250,
      responseBytes: 5000,
      itemCount: 12,
    });
    const success = db.prepare("SELECT next_due_at,last_duration_ms,last_response_bytes,last_item_count FROM icai_source_schedule WHERE source_id='foundation'").get();
    assert.notEqual(success.next_due_at, beforeSuccess);
    assert.ok(new Date(success.next_due_at) > new Date("2030-01-01T02:31:00.000Z"));
    assert.equal(success.last_duration_ms, 1250);
    assert.equal(success.last_response_bytes, 5000);
    assert.equal(success.last_item_count, 12);

    const beforeFailure = db.prepare("SELECT next_due_at FROM icai_source_schedule WHERE source_id='exam-dates'").get().next_due_at;
    await scheduler.recordIcaiSourceScheduleResult(cloudDb, "exam-dates", {
      success: false,
      completedAt: "2030-01-01T02:32:00.000Z",
      durationMs: 900,
    });
    const afterFailure = db.prepare("SELECT next_due_at FROM icai_source_schedule WHERE source_id='exam-dates'").get().next_due_at;
    assert.equal(afterFailure, beforeFailure, "failed sources must remain due instead of being pushed into the future");

    db.prepare("INSERT INTO icai_sync_runs(id,status) VALUES('active-run','running')").run();
    const deferred = await scheduler.selectIcaiScheduledDispatch(
      cloudDb,
      "2030-01-01T04:30:00.000Z",
    );
    assert.equal(deferred.status, "deferred");
    assert.deepEqual(deferred.sourceIds, []);
    db.prepare("DELETE FROM icai_sync_runs WHERE id='active-run'").run();
  } finally {
    db.close();
    cleanup();
  }
});

test("Phase 4 retry and manual selectors isolate only requested work", async () => {
  const { scheduler, cleanup } = await loadScheduler();
  const db = schedulerDb();
  const cloudDb = d1(db);
  try {
    db.prepare(`INSERT INTO icai_sync_items(id,run_id,source_id,status,retry_eligible,completed_at)
      VALUES('failed-item','origin-run','intermediate','failed',1,'2030-01-01T11:00:00.000Z')`).run();
    const retryWindow = await scheduler.selectIcaiScheduledDispatch(
      cloudDb,
      "2030-01-01T12:30:00.000Z",
    );
    assert.equal(retryWindow.status, "dispatch");
    assert.equal(retryWindow.window.key, "failed-retry");
    assert.deepEqual(retryWindow.sourceIds, ["intermediate"]);
    assert.equal(retryWindow.retryRunId, "origin-run");
    assert.equal(retryWindow.retryMode, "failed");

    const group = await scheduler.selectIcaiManualDispatch(cloudDb, {
      mode: "group",
      value: "foundation",
      now: "2030-01-01T00:00:00.000Z",
    });
    assert.deepEqual(group.sourceIds, ["foundation"]);

    const source = await scheduler.selectIcaiManualDispatch(cloudDb, {
      mode: "source",
      value: "intermediate",
      now: "2030-01-01T00:00:00.000Z",
    });
    assert.deepEqual(source.sourceIds, ["intermediate"]);
  } finally {
    db.close();
    cleanup();
  }
});

test("Phase 4 runtime wiring scopes source execution and exposes operator scheduling controls", () => {
  const scope = read("workers/icai-sync/source-scope.ts");
  const worker = read("workers/icai-sync/index.ts");
  const webWorker = read("custom-worker.ts");
  const route = read("app/api/admin/icai-sync/status/route.ts");
  const actions = read("app/(admin)/admin/icai-sync/schedule-actions.ts");
  const component = read("components/icai/schedule-admin.tsx");
  const wrangler = read("wrangler.jsonc");
  const migration = read("d1/migrations/0028_icai_sync_scheduling.sql");

  assert.match(scope, /ACTIVE_SOURCE_QUERY/);
  assert.match(scope, /AND \"id\" IN \(/);
  assert.match(scope, /recordIcaiScheduledSourceOutcomes/);
  assert.match(scope, /status IN \('failed','timed_out','skipped'\)/);
  assert.match(worker, /scopeIcaiSourceDatabase\(env\.DB,sourceIds\)/);
  assert.match(worker, /recordIcaiScheduledSourceOutcomes\(env\.DB,summary\.runId,sourceIds\)/);
  assert.match(webWorker, /selectIcaiScheduledDispatch/);
  assert.match(webWorker, /markIcaiScheduleDispatched/);
  assert.match(route, /getIcaiScheduleOverview/);
  assert.match(route, /dueAt: next\.scheduledFor/);
  assert.match(route, /scheduleError: scheduleResult\.error/);
  assert.match(read("components/icai/sync-live-refresh.tsx"), /Distributed scheduler setup is incomplete/);
  assert.match(read("components/icai/admin-sync-monitor.tsx"), /Every 2 hours · IST windows/);

  for (const mode of ["due", "source", "group", "failed", "high-impact", "all"]) {
    assert.match(actions, new RegExp(`\\"${mode}\\"`));
  }
  assert.match(actions, /interval_minutes=\?2,priority=\?3,next_due_at=\?4/);
  assert.match(actions, /pause_scheduled_source/);
  assert.match(actions, /resume_scheduled_source/);
  assert.match(component, /Two-hour source schedule/);
  assert.match(component, /Mark due now/);
  assert.match(component, /Confirm all/);

  assert.match(wrangler, /30 0,2,4,6,8,10,12,14,16,18 \* \* \*/);
  for (const hour of [0, 6, 8, 10, 12, 14, 16, 18, 20, 22]) {
    assert.match(migration, new RegExp(`,${hour},`));
  }
  assert.match(migration, /BETWEEN 360 AND 10080/);
  assert.match(migration, /WHEN s\.trust_level='high_impact' THEN 480/);
  assert.match(migration, /THEN 7200/);
});
