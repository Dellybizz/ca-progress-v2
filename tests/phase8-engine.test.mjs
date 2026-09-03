import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("daily ICAI sync remains a Cloudflare scheduled job independent of user traffic", () => {
  const bootstrap = read("wrangler.jsonc");
  const wrangler = read("wrangler.web.jsonc");
  const worker = read("custom-worker.ts");
  const syncWorker = read("workers/icai-sync/wrangler.jsonc");
  assert.match(bootstrap, /"main"\s*:\s*"\.\/custom-worker\.ts"/);
  assert.doesNotMatch(bootstrap, /"services"\s*:/);
  assert.match(wrangler, /"crons"\s*:\s*\[[^\]]*"30 0 \* \* \*"/);
  assert.match(wrangler, /"binding"\s*:\s*"ICAI_SYNC_SERVICE"/);
  assert.match(wrangler, /"service"\s*:\s*"ca-progress-v2-icai-sync"/);
  assert.match(worker, /scheduled\(/);
  assert.match(worker, /BACKGROUND_JOBS/); assert.match(worker, /jobs\.map/);
  assert.match(worker, /service\.fetch\(new Request\("https:\/\/icai-sync\.internal\/run"/);
  assert.match(worker, /trigger:\s*"cron"/);
  assert.match(syncWorker, /"workers_dev"\s*:\s*false/);
});

test("sync engine supports conditional fetch, backoff, pacing and last-verified failure isolation", () => {
  const sync = read("workers/icai-sync/sync-engine.ts");
  const migration = read("supabase/migrations/20260830080100_phase8_icai_sync_engine.sql");
  assert.match(sync, /If-None-Match/);
  assert.match(sync, /If-Modified-Since/);
  assert.match(sync, /retryDelay/);
  assert.match(sync, /Retry-After|retry-after/);
  assert.match(sync, /requestIntervalSeconds/);
  assert.match(sync, /MAX_HTML_BYTES/);
  assert.match(sync, /icai_sync_record_unchanged/);
  assert.match(sync, /icai_sync_mark_source_failure/);
  assert.match(migration, /icai_sync_mark_source_failure[\s\S]*update public\.icai_sources[\s\S]*update public\.icai_sync_runs/i);
  assert.doesNotMatch(migration, /icai_sync_mark_source_failure[\s\S]*delete from public\.icai_resources/i);
});

test("unchanged resources are deterministic and are not duplicated", () => {
  const sync = read("workers/icai-sync/sync-engine.ts");
  const migration = read("supabase/migrations/20260830080100_phase8_icai_sync_engine.sql");
  assert.match(sync, /sha256Hex\(`\$\{source\.id\}:\$\{item\.officialUrl\}`\)/);
  assert.match(migration, /v_existing_resource\.content_hash\s*=\s*v_item->>'content_hash'/);
  assert.match(migration, /last_seen_at\s*=\s*now\(\)\s*,\s*source_snapshot_id\s*=\s*v_snapshot_id/);
  assert.match(migration, /unique \(source_id, official_url\)/);
});

test("attempt selection consumes verified exam_attempts instead of hardcoded month arrays", () => {
  const auth = read("lib/auth/server.ts");
  assert.match(auth, /from\("exam_attempts"\)/);
  assert.match(auth, /eq\("verification_status", "verified"\)/);
  assert.match(auth, /verified_exam_attempt/);
  assert.doesNotMatch(auth, /const\s+attemptMonths\s*=/);
});

test("source adapters are restricted to official ICAI hosts and keep metadata-only links", () => {
  const sync = read("workers/icai-sync/sync-engine.ts");
  const html = read("lib/icai/html.ts");
  const docs = read("docs/ICAI_SYNC_SETUP.md");
  assert.match(sync, /isApprovedIcaiUrl\(source\.officialUrl\)/);
  assert.match(html, /host === "icai\.org" \|\| host\.endsWith\("\.icai\.org"\)/);
  assert.match(docs, /does not copy ICAI PDF\/study-material bodies/i);
});

test("the Next.js app delegates heavy ICAI sync work instead of bundling the parser", () => {
  const proxy = read("lib/icai/sync.ts");
  assert.match(proxy, /ICAI_SYNC_SERVICE/);
  assert.match(proxy, /getCloudflareContext/);
  assert.doesNotMatch(proxy, /from "\.\/adapters"/);
  assert.doesNotMatch(proxy, /from "\.\/hash"/);
  assert.doesNotMatch(proxy, /from "\.\/html"/);
  assert.doesNotMatch(proxy, /parseOfficialSource|fetchOfficialPage|processSource/);
});
