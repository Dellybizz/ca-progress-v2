import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, imports = {}) {
  const source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import ${name}`); }, loaded, loaded.exports);
  return loaded.exports;
}
const projection = load("lib/offline/projection.ts");
const { stageOfflineWrites } = load("lib/offline/atomic.ts");
function adapter(sqlite) {
  function prepare(sql, values = []) {
    const statement = () => sqlite.prepare(sql);
    return { bind: (...next) => prepare(sql, next), first: async () => statement().get(...values) ?? null, all: async () => ({ results: statement().all(...values) }), run: async () => statement().run(...values), sql, values };
  }
  return { prepare, batch: async statements => { sqlite.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
}

test("offline write staging commits neither domain rows nor events before the atomic receipt", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE items(id TEXT PRIMARY KEY,value INTEGER); INSERT INTO items VALUES('x',0); CREATE TABLE events(id TEXT PRIMARY KEY); CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY, description TEXT,source_freeze_commit TEXT)");
  sqlite.exec(read("d1/migrations/0040_product_consistency_phase6_offline.sql"));
  sqlite.exec(read("d1/migrations/0040_product_consistency_phase6_offline.sql"));
  const db = adapter(sqlite), staged = stageOfflineWrites(db);
  await staged.db.prepare("UPDATE items SET value=value+1 WHERE id=?").bind("x").run();
  await staged.db.batch([staged.db.prepare("INSERT INTO events VALUES(?)").bind("event")]);
  assert.equal(sqlite.prepare("SELECT value FROM items").get().value, 0);
  const receipt = db.prepare("INSERT INTO offline_mutation_receipts(user_id,mutation_id,request_hash,response_json,response_status,entity_key,guard_ok) VALUES('owner','edit','hash','{}',200,'item',?)");
  await db.batch([receipt.bind(1), ...staged.writes]);
  assert.equal(sqlite.prepare("SELECT value FROM items").get().value, 1);
  await assert.rejects(db.batch([receipt.bind(1), ...staged.writes]));
  assert.equal(sqlite.prepare("SELECT value FROM items").get().value, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM events").get().count, 1);
  const other = db.prepare("INSERT INTO offline_mutation_receipts(user_id,mutation_id,request_hash,response_json,response_status,entity_key,guard_ok) VALUES('owner','second','hash','{}',200,'item',0)");
  await assert.rejects(db.batch([other, db.prepare("UPDATE items SET value=999")]));
  assert.equal(sqlite.prepare("SELECT value FROM items").get().value, 1);
  sqlite.close();
});

test("offline progress projections preserve unrelated chapters and expose the conflict baseline", () => {
  const state = { completed_at: null, revision_1_at: null, revision_2_at: null, test_1_at: null, test_2_at: null };
  const model = { mode: "ready", chapters: [{ id: "a", state }, { id: "b", state }] };
  const edit = { action: "set_stage", chapterId: "a", stage: "completed", enabled: true, offlineOccurredAt: "2026-09-10T12:00:00Z" };
  const next = projection.projectOfflineEdit("progress", model, "/api/progress", edit);
  assert.equal(next.chapters[0].state.completed_at, edit.offlineOccurredAt);
  assert.equal(next.chapters[1].state.completed_at, null);
  assert.equal(model.chapters[0].state.completed_at, null);
  assert.deepEqual(projection.conflictBaseline("/api/progress", edit, model), state);
});

test("offline timers retain actual time and pauses instead of the reconnect duration", () => {
  const base = { mode: "ready", subjects: [], timer: null, analytics: { recentSessions: [] } };
  const edit = (action, minute) => ({ action, mode: "stopwatch", timezone: "Asia/Kolkata", clientId: "session", offlineOccurredAt: `2026-09-10T12:${String(minute).padStart(2, "0")}:00Z` });
  let model = projection.projectOfflineEdit("study", base, "/api/study/timer", edit("start", 0));
  model = projection.projectOfflineEdit("study", model, "/api/study/timer", edit("pause", 10));
  model = projection.projectOfflineEdit("study", model, "/api/study/timer", edit("resume", 20));
  model = projection.projectOfflineEdit("study", model, "/api/study/timer", edit("finish", 25));
  assert.equal(model.timer, null);
  assert.equal(model.analytics.recentSessions[0].durationSeconds, 900);
  assert.equal(model.analytics.recentSessions[0].pausedSeconds, 600);
});

test("supported routes snapshot real models and the offline shell has no server identity", () => {
  for (const page of ["dashboard", "syllabus", "progress", "study", "planner", "notes", "resources"]) assert.match(read(`app/(student)/${page}/page.tsx`), /OfflineSnapshot/);
  assert.match(read("app/offline/page.tsx"), /force-static/);
  assert.doesNotMatch(read("app/offline/page.tsx"), /getStudentContext|cookies\(|optionalUser/);
  const sw = read("public/sw.js");
  assert.match(sw, /url.pathname.startsWith\("\/_next\/static\/"\)/);
  assert.doesNotMatch(sw, /cache\.put\(request, response.clone\(\)\).*navigation/);
  assert.match(sw, /asset && response.ok/);
});

test("offline endpoint deduplicates replay, detects stale records, and chains dependent edits atomically", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT); CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT,title TEXT,body_html TEXT,subject_id TEXT,chapter_id TEXT,visibility TEXT,updated_at TEXT); CREATE TABLE events(id TEXT PRIMARY KEY)");
  sqlite.exec(read("d1/migrations/0040_product_consistency_phase6_offline.sql"));
  const real = adapter(sqlite);
  const transaction = new AsyncLocalStorage();
  let calls = 0;
  const handler = async request => {
    calls++;
    const body = await request.json(), db = transaction.getStore().db;
    await db.prepare("INSERT INTO notes(id,user_id,title,body_html,visibility,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body_html=excluded.body_html,updated_at=excluded.updated_at").bind(body.id || body.clientId, "owner", body.title, body.bodyHtml, "private", body.offlineOccurredAt).run();
    await db.prepare("INSERT INTO events VALUES(?)").bind(crypto.randomUUID()).run();
    return Response.json({ id: body.id || body.clientId }, { status: 201 });
  };
  const { POST } = load("app/api/offline/mutations/route.ts", {
    "@/lib/offline/config": { OFFLINE_ENABLED: true },
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/academic/student-context": { getStudentContext: async () => ({ mode: "ready", userId: "owner", contextKey: "scope" }) },
    "@/lib/data/d1/client": { getD1RuntimeDatabase: () => real },
    "@/lib/offline/transaction-context": { offlineTransaction: transaction },
    "@/lib/offline/atomic": { stageOfflineWrites },
    "@/lib/offline/projection": projection,
    ...Object.fromEntries(["progress", "planner/tasks", "notes", "study/timer"].map(route => [`@/app/api/${route}/route`, { POST: handler }])),
  });
  const id = crypto.randomUUID(), first = crypto.randomUUID();
  const send = (key, input) => POST(new Request("https://ca.test/api/offline/mutations", { method: "POST", headers: { "Idempotency-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(input) }));
  const input = { ownerId: "owner", contextKey: "scope", url: "/api/notes", body: { clientId: id, title: "First", bodyHtml: "<p>Draft</p>", offlineOccurredAt: "2026-09-10T10:00:00Z" }, expected: null };
  const a = await send(first, input);
  assert.equal(a.status, 201, JSON.stringify(await a.clone().json()));
  const b = await send(first, input);
  assert.deepEqual(await b.json(), await a.json());
  assert.equal(calls, 1);
  assert.equal((await send(first, { ...input, body: { ...input.body, title: "Changed reuse" } })).status, 409);
  assert.equal((await send(crypto.randomUUID(), { ...input, ownerId: "other" })).status, 403);
  const followup = { ...input, body: { ...input.body, id, title: "Second" }, expected: { updated_at: "local-optimistic-time" }, predecessor: first };
  const second = crypto.randomUUID();
  assert.equal((await send(second, followup)).status, 201);
  sqlite.prepare("UPDATE notes SET title='Changed elsewhere' WHERE id=?").run(id);
  assert.equal((await send(crypto.randomUUID(), { ...followup, predecessor: second })).status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM events").get().count, 2);
  sqlite.close();
});
