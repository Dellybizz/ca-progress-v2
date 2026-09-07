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

async function loadExecutableParser() {
  const dir = mkdtempSync(join(tmpdir(), "ca-progress-icai-phase4-parser-"));
  for (const name of ["types", "classify", "html", "adapters"]) {
    const source = read(`lib/icai/${name}.ts`);
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: `${name}.ts`,
    }).outputText;
    output = output.replace(/from ["']\.\/([a-z-]+)["']/g, 'from "./$1.mjs"');
    writeFileSync(join(dir, `${name}.mjs`), output);
  }
  const adapters = await import(pathToFileURL(join(dir, "adapters.mjs")).href);
  const html = await import(pathToFileURL(join(dir, "html.mjs")).href);
  return { adapters, html, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function executableRedirectHandler(fetchImpl) {
  const engine = read("workers/icai-sync/sync-engine.ts");
  const start = engine.indexOf("async function fetchFollowingApprovedRedirects");
  const end = engine.indexOf("\n\nasync function fetchOfficialPage", start);
  assert.ok(start >= 0 && end > start, "redirect handler must remain discoverable for executable verification");
  const source = engine.slice(start, end).replace("url:string,init:RequestInit", "url,init");
  const isApprovedHttpIcaiUrl = (value) => {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return (host === "icai.org" || host.endsWith(".icai.org")) && (url.protocol === "https:" || url.protocol === "http:");
    } catch {
      return false;
    }
  };
  const factory = new Function(
    "fetch",
    "isApprovedHttpIcaiUrl",
    "MAX_REDIRECTS",
    "REDIRECT_STATUSES",
    `return (${source});`,
  );
  return factory(fetchImpl, isApprovedHttpIcaiUrl, 5, new Set([301, 302, 303, 307, 308]));
}

test("Phase 4 executes the ICAI parser against representative official-page HTML", async () => {
  const { adapters, html, cleanup } = await loadExecutableParser();
  try {
    assert.equal(html.isApprovedIcaiUrl("https://www.icai.org/category/foundation-course"), true);
    assert.equal(html.isApprovedIcaiUrl("https://resource.cdn.icai.org/file.pdf"), true);
    assert.equal(html.isApprovedIcaiUrl("https://icai.org.evil.example/file.pdf"), false);

    const parsed = adapters.parseOfficialSource(`
      <nav><a href="/">Home</a></nav>
      <a href="/post/foundation-exam-may-2027?utm_source=test">
        Foundation Examination May 2027 scheduled on 4 May 2027
      </a>
      <a href="https://evil.example/foundation-exam-may-2027">Foundation Examination May 2027</a>
    `, {
      id: "phase4-foundation",
      name: "ICAI Foundation Course",
      sourceType: "course_resource_hub",
      officialUrl: "https://www.icai.org/category/foundation-course",
      adapterKey: "resource_hub",
      adapterConfig: { allow_empty: false },
      levelCodes: ["foundation"],
      resourceTypes: [],
      trustLevel: "standard",
      authoritativeListing: true,
      parserVersion: "phase8.1",
      timeoutMs: 15000,
      requestIntervalSeconds: 4,
      lastContentHash: null,
      etag: null,
      lastModified: null,
    }, []);

    assert.equal(parsed.resources.length, 1, "external and generic navigation links must be excluded");
    assert.equal(parsed.resources[0].officialUrl, "https://www.icai.org/post/foundation-exam-may-2027");
    assert.deepEqual(parsed.resources[0].levelCodes, ["foundation"]);
    assert.deepEqual(parsed.resources[0].attemptKeys, ["2027-05"]);
    assert.equal(parsed.attempts.length, 1);
    assert.equal(parsed.attempts[0].startDate, null, "parser must not invent an exam start date");
    assert.equal(parsed.attempts[0].endDate, null, "parser must not invent an exam end date");
    assert.equal(parsed.events.length, 1);
    assert.equal(parsed.events[0].eventDate, "2027-05-04");
  } finally {
    cleanup();
  }
});

test("Phase 4 executes the exact redirect handler and rejects an unsafe later hop before fetching it", async () => {
  const seen = [];
  const responses = [
    new Response(null, { status: 302, headers: { location: "/safe-hop" } }),
    new Response(null, { status: 302, headers: { location: "https://evil.example/escape" } }),
  ];
  const handler = executableRedirectHandler(async (url, init) => {
    seen.push({ url: String(url), redirect: init.redirect });
    return responses.shift();
  });

  await assert.rejects(
    handler("https://www.icai.org/start", { method: "GET" }),
    /Rejected redirect outside approved ICAI hosts/,
  );
  assert.deepEqual(seen, [
    { url: "https://www.icai.org/start", redirect: "manual" },
    { url: "https://www.icai.org/safe-hop", redirect: "manual" },
  ]);

  const successSeen = [];
  const successHandler = executableRedirectHandler(async (url, init) => {
    successSeen.push({ url: String(url), redirect: init.redirect });
    if (successSeen.length === 1) return new Response(null, { status: 307, headers: { location: "/final" } });
    return new Response("ok", { status: 200, headers: { "content-type": "text/html" } });
  });
  const response = await successHandler("https://www.icai.org/start", { method: "GET" });
  assert.equal(response.status, 200);
  assert.equal(successSeen.length, 2);
  assert.equal(successSeen[1].url, "https://www.icai.org/final");
});

test("Phase 4 executes the production run-acquisition SQL and proves overlapping runs are rejected atomically", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  const acquireStart = engine.indexOf("async function acquireRun");
  const prepareMarker = "runtime.db.prepare(`";
  const sqlStartMarker = engine.indexOf(prepareMarker, acquireStart);
  const sqlStart = sqlStartMarker + prepareMarker.length;
  const sqlEnd = engine.indexOf("`)", sqlStart);
  assert.ok(acquireStart >= 0 && sqlStartMarker >= acquireStart && sqlEnd > sqlStart);
  const sql = engine.slice(sqlStart, sqlEnd);

  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE icai_sync_runs(
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL,
    requested_by TEXT,
    parser_version TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    source_total INTEGER NOT NULL,
    details TEXT
  );`);
  const statement = db.prepare(sql);
  const startedAt = "2026-09-08T00:00:00.000Z";
  const first = statement.get("run-1", "manual", "admin-1", "phase8.1", startedAt, 3, "{}");
  const second = statement.get("run-2", "cron", null, "phase8.1", startedAt, 3, "{}");
  assert.equal(first.id, "run-1");
  assert.equal(second, undefined, "a second queued/running sync must not acquire the lock");
  assert.equal(db.prepare("SELECT started_at FROM icai_sync_runs WHERE id='run-1'").get().started_at, startedAt);

  db.prepare("UPDATE icai_sync_runs SET status='success' WHERE id='run-1'").run();
  const third = statement.get("run-3", "cron", null, "phase8.1", startedAt, 3, "{}");
  assert.equal(third.id, "run-3", "the lock must release after the previous run reaches a terminal state");
  db.close();
});

test("Phase 4 proves ICAI source bootstrap and review-audit migrations are directly idempotent", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE _ca_schema_migrations(
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      source_freeze_commit TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE icai_sources(
      id TEXT PRIMARY KEY,
      name TEXT,
      official_url TEXT,
      source_type TEXT,
      trust_level TEXT,
      adapter_key TEXT,
      adapter_config TEXT,
      parser_version TEXT,
      authoritative_listing INTEGER,
      resource_types TEXT,
      level_codes TEXT,
      request_interval_seconds INTEGER,
      timeout_ms INTEGER,
      is_active INTEGER,
      etag TEXT,
      last_modified TEXT,
      last_content_hash TEXT,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error_at TEXT,
      last_error TEXT,
      consecutive_failures INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE icai_review_queue(id TEXT PRIMARY KEY, status TEXT NOT NULL);
    INSERT INTO icai_sources(id,etag,last_success_at,consecutive_failures,is_active)
      VALUES('icai-foundation-course','etag-before','2026-09-01T00:00:00Z',7,0);
  `);

  const bootstrap = read("d1/migrations/0024_icai_source_bootstrap.sql");
  const audit = read("d1/migrations/0025_icai_review_audit.sql");
  db.exec(bootstrap);
  db.exec(bootstrap);
  db.exec(audit);
  db.exec(audit);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM icai_sources WHERE is_active=1").get().count, 3);
  const health = db.prepare("SELECT etag,last_success_at,consecutive_failures FROM icai_sources WHERE id='icai-foundation-course'").get();
  assert.equal(health.etag, "etag-before");
  assert.equal(health.last_success_at, "2026-09-01T00:00:00Z");
  assert.equal(health.consecutive_failures, 7);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM _ca_schema_migrations WHERE version='0024'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM _ca_schema_migrations WHERE version='0025'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='icai_review_decisions'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'icai_review_%'").get().count, 4);
  db.close();
});

test("Phase 4 keeps date preservation, strict review application, destructive-change review, and duplicate suppression under regression coverage", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  const review = read("lib/icai/review.ts");
  const client = read("workers/icai-sync/d1-client.ts");
  const audit = read("d1/migrations/0025_icai_review_audit.sql");

  assert.match(engine, /parsedAttempt\.startDate\?\?existingAttempt\?\.start_date/);
  assert.match(engine, /parsedAttempt\.endDate\?\?existingAttempt\?\.end_date/);
  assert.match(engine, /Parser returned zero academic items\. Last verified data was preserved for review\./);

  assert.match(review, /assertCurrentMatchesOld/);
  assert.match(review, /assertPatchMatchesNew/);
  assert.match(review, /source snapshot does not belong to this run and source/);
  assert.match(review, /isApprovedIcaiUrl/);
  assert.match(review, /ATTEMPT_PATCH_KEYS/);
  assert.match(review, /EVENT_PATCH_KEYS/);
  assert.match(review, /RESOURCE_PATCH_KEYS/);
  assert.match(review, /INSERT INTO icai_review_decisions/);
  assert.match(audit, /ICAI review decision requires audit record/);
  assert.match(audit, /ICAI review decisions are append-only/);

  assert.match(client, /decision_status='duplicate_suppressed'/);
  assert.match(client, /status='superseded'/);
  assert.match(client, /An authoritative ICAI listing no longer contains this resource/);
  const authoritativeBlock = client.slice(client.indexOf("const authoritative="));
  assert.doesNotMatch(authoritativeBlock, /UPDATE icai_resources SET status='removed'/);
  assert.match(authoritativeBlock, /decision:"pending_review"/);
});

test("Phase 4 is an explicit gate in CI, retirement closure, and Cloudflare deployment", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(
    packageJson.scripts["test:icai:phase4"],
    "node --test tests/icai-sync-phase1.test.mjs tests/icai-sync-phase2.test.mjs tests/icai-sync-phase3.test.mjs tests/icai-sync-phase4.test.mjs",
  );
  assert.match(packageJson.scripts["cf:check"], /cf:check:icai/);
  assert.match(packageJson.scripts["cf:check"], /cf:check:web/);

  for (const path of [
    ".github/workflows/ci.yml",
    ".github/workflows/supabase-retirement-closure.yml",
    ".github/workflows/deploy-staging.yml",
  ]) {
    const workflow = read(path);
    assert.match(workflow, /Focused ICAI Phase 4 verification/);
    assert.match(workflow, /npm run test:icai:phase4/);
    assert.match(workflow, /npm run typecheck/);
    assert.match(workflow, /npm run lint/);
    assert.match(workflow, /npm run d1:hot-indexes:validate/);
    assert.match(workflow, /npm test/);
    assert.match(workflow, /npm run build/);
    assert.match(workflow, /npm run cf:check/);
    assert.match(workflow, /npm run cf:smoke/);
  }
});
