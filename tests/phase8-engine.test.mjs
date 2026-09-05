import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("daily ICAI sync remains a Cloudflare scheduled job independent of user traffic",()=>{const wrangler=read("wrangler.web.jsonc");const worker=read("custom-worker.ts");const syncWorker=read("workers/icai-sync/wrangler.jsonc");assert.match(wrangler,/"crons"\s*:\s*\[[^\]]*"30 0 \* \* \*"/);assert.match(wrangler,/"binding"\s*:\s*"ICAI_SYNC_SERVICE"/);assert.match(worker,/scheduled\(/);assert.match(worker,/BACKGROUND_JOBS/);assert.match(worker,/trigger:\s*"cron"/);assert.match(syncWorker,/"workers_dev"\s*:\s*false/);});
test("sync engine supports conditional fetch, backoff, pacing and failure isolation",()=>{const sync=read("workers/icai-sync/sync-engine.ts");assert.match(sync,/If-None-Match/);assert.match(sync,/If-Modified-Since/);assert.match(sync,/retryDelay/);assert.match(sync,/Retry-After|retry-after/);assert.match(sync,/requestIntervalSeconds/);assert.match(sync,/MAX_HTML_BYTES/);assert.match(sync,/icai_sync_record_unchanged/);assert.match(sync,/icai_sync_mark_source_failure/);});
test("unchanged resources use deterministic identities",()=>{const sync=read("workers/icai-sync/sync-engine.ts");assert.match(sync,/sha256Hex\(`\$\{source\.id\}:\$\{item\.officialUrl\}`\)/);});
test("attempt selection consumes verified exam_attempts",()=>{const auth=read("lib/auth/server.ts");assert.match(auth,/from\("exam_attempts"\)/);assert.match(auth,/eq\("verification_status", "verified"\)/);assert.match(auth,/verified_exam_attempt/);});
test("source adapters are restricted to official ICAI hosts",()=>{const sync=read("workers/icai-sync/sync-engine.ts");const html=read("lib/icai/html.ts");assert.match(sync,/isApprovedIcaiUrl\(source\.officialUrl\)/);assert.match(html,/host === "icai\.org" \|\| host\.endsWith\("\.icai\.org"\)/);});
test("the Next.js app delegates heavy ICAI sync work",()=>{const proxy=read("lib/icai/sync.ts");assert.match(proxy,/ICAI_SYNC_SERVICE/);assert.match(proxy,/getCloudflareContext/);assert.doesNotMatch(proxy,/parseOfficialSource|fetchOfficialPage|processSource/);});
