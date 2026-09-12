// Browser regression gate. Requires Playwright and Chromium; no production calls.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { chromium } = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`) : require("playwright");
const root = fileURLToPath(new URL("../../", import.meta.url));
const server = createServer((request, response) => {
  if (request.url === "/sw.js") { response.setHeader("Content-Type", "application/javascript"); response.end(readFileSync(`${root}public/sw.js`, "utf8")); return; }
  if (request.url === "/_next/static/test.js") { response.setHeader("Content-Type", "application/javascript"); response.end("window.shellReady=true;"); return; }
  if (request.url === "/dashboard") { response.setHeader("Content-Type", "text/html"); response.end("<html><body>Private dashboard fixture</body></html>"); return; }
  if (request.url?.endsWith(".js") && request.url.startsWith("/lib/offline/")) {
    const source = readFileSync(`${root}${request.url.replace(/\.js$/, ".ts")}`, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"@/lib/offline/', '"/lib/offline/').replace(/from "(\/lib\/offline\/[^".]+)"/g, 'from "$1.js"');
    response.setHeader("Content-Type", "application/javascript"); response.end(compiled); return;
  }
  response.setHeader("Content-Type", "text/html"); response.end('<html><body>Offline test fixture<script src="/_next/static/test.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try { browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) }); } catch (error) { server.close(); throw error; }
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin);
  const initialize = () => page.evaluate(async () => { window.db = await import("/lib/offline/database.js"); window.mutations = await import("/lib/offline/mutation.js"); });
  await initialize();
  await page.evaluate(async () => {
    await db.setOfflineIdentity({ userId: "alice", contextKey: "alice:scope", context: {} });
    await db.putOfflineSnapshot("alice", "alice:scope:dashboard", { name: "Alice", token: "do-not-store", signedUrl: "https://files.test?token=secret" });
    await db.putOfflineSnapshot("bob", "bob:scope:dashboard", { name: "Bob" });
    await db.queueOfflineMutation({ ownerId: "alice", contextKey: "alice:scope", idempotencyKey: "first", url: "/api/notes", body: JSON.stringify({ url: "/api/notes", body: {} }) });
    await db.queueOfflineMutation({ ownerId: "alice", contextKey: "alice:scope", idempotencyKey: "second", url: "/api/notes", body: JSON.stringify({ url: "/api/notes", body: {} }) });
  });
  await page.reload(); await initialize();
  assert.deepEqual(await page.evaluate(async () => ({ alice: await db.getOfflineSnapshot("alice", "alice:scope:dashboard"), bob: await db.getOfflineSnapshot("bob", "bob:scope:dashboard"), pending: (await db.getPendingMutations("alice")).length })), { alice: { name: "Alice" }, bob: { name: "Bob" }, pending: 2 });
  console.log("PASS: restart persistence, owner isolation and secret stripping");
  const retry = await page.evaluate(async () => {
    let calls = 0;
    const fetcher = async url => url.endsWith("context") ? Response.json({ userId: "alice", contextKey: "alice:scope" }) : (calls++, Response.json({ error: "temporary" }, { status: 503 }));
    await db.flushPendingMutations("alice", fetcher);
    const rows = await db.getPendingMutations("alice");
    return { calls, attempts: rows.map(row => row.attempts), backoff: Date.parse(rows[0].nextAttemptAt) > Date.now() };
  });
  assert.deepEqual(retry, { calls: 1, attempts: [1, 0], backoff: true });
  console.log("PASS: failed edits retain FIFO ordering and backoff");
  // Fresh owner avoids waiting for retry timers.
  const simultaneous = await page.evaluate(async () => {
    await db.setOfflineIdentity({ userId: "race", contextKey: "scope", context: {} });
    await db.queueOfflineMutation({ ownerId: "race", contextKey: "scope", idempotencyKey: "one", url: "/api/notes", body: JSON.stringify({ url: "/api/notes", body: {} }) });
    let calls = 0;
    const fetcher = async url => { if (url.endsWith("context")) return Response.json({ userId: "race", contextKey: "scope" }); calls++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ id: "one" }); };
    await Promise.all([db.flushPendingMutations("race", fetcher), db.flushPendingMutations("race", fetcher)]);
    return { calls, pending: (await db.getPendingMutations("race")).length };
  });
  assert.deepEqual(simultaneous, { calls: 1, pending: 0 });
  console.log("PASS: concurrent flushers send each queued edit once");
  const conflict = await page.evaluate(async () => {
    await db.setOfflineIdentity({ userId: "conflict", contextKey: "scope", context: {} });
    for (const id of ["one", "two"]) await db.queueOfflineMutation({ ownerId: "conflict", contextKey: "scope", idempotencyKey: id, url: "/api/notes", body: "{}" });
    let calls = 0;
    await db.flushPendingMutations("conflict", async url => url.endsWith("context") ? Response.json({ userId: "conflict", contextKey: "scope" }) : (calls++, Response.json({ error: "changed" }, { status: 409 })));
    return { calls, states: (await db.getPendingMutations("conflict")).map(row => row.status) };
  });
  assert.deepEqual(conflict, { calls: 1, states: ["conflict", "pending"] });
  console.log("PASS: conflicts stop dependent edits without deleting data");
  const switched = await page.evaluate(async () => {
    let writes = 0;
    await db.setOfflineIdentity({ userId: "switched", contextKey: "scope", context: {} });
    await db.queueOfflineMutation({ ownerId: "switched", contextKey: "scope", idempotencyKey: "pending", url: "/api/notes", body: "{}" });
    await db.flushPendingMutations("switched", async url => url.endsWith("context") ? Response.json({ userId: "bob", contextKey: "scope" }) : (writes++, Response.json({})));
    return { writes, active: await db.getOfflineIdentity() };
  });
  assert.deepEqual(switched, { writes: 0, active: null });
  console.log("PASS: server-side account change locks offline replay");
  const pressure = await page.evaluate(async () => {
    Object.defineProperty(navigator.storage, "estimate", { configurable: true, value: async () => ({ usage: 90, quota: 100 }) });
    for (let i = 0; i < 12; i++) await db.putOfflineSnapshot("storage", `scope:${i}`, { i });
    await db.saveOfflineFile("storage", "file", new Blob(["retained"]), { title: "saved.txt" });
    await db.queueOfflineMutation({ ownerId: "storage", contextKey: "scope", idempotencyKey: "pending", url: "/api/notes", body: "{}" });
    await db.enforceOfflineStorageLimit("storage", true);
    const exported = await db.exportOfflineOwner("storage");
    await db.clearOfflineOwner("storage");
    return { snapshots: exported.stores.snapshots.length, edits: exported.stores.mutations.length, files: exported.stores.files.length, cleared: (await db.getPendingMutations("storage")).length, otherOwnerPreserved: (await db.getOfflineSnapshot("bob", "bob:scope:dashboard")).name };
  });
  assert.equal(pressure.edits, 1); assert.equal(pressure.files, 1); assert.equal(pressure.cleared, 0); assert.equal(pressure.otherOwnerPreserved, "Bob");
  assert.ok(pressure.snapshots <= 7);
  console.log("PASS: storage pressure, export and owner-only clearing preserve edits/files");
  await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
  await page.goto(`${origin}/dashboard`);
  assert.equal(await page.locator("body").textContent(), "Private dashboard fixture");
  const cached = await page.evaluate(async () => { const names = await caches.keys(); return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat(); });
  assert.ok(cached.includes("/offline")); assert.ok(cached.includes("/_next/static/test.js")); assert.ok(!cached.includes("/dashboard"));
  await context.setOffline(true);
  await page.goto(`${origin}/progress`);
  assert.match(await page.locator("body").textContent(), /Offline test fixture/);
  assert.equal(await page.evaluate(async () => fetch("/api/private").then(() => false).catch(() => true)), true);
  await context.setOffline(false);
  await initialize();
  await page.evaluate(() => db.setOfflineIdentity({ userId: "alice", contextKey: "scope", context: {} }));
  await page.goto(`${origin}/login`); await initialize();
  assert.equal(await page.evaluate(() => db.getOfflineIdentity()), null);
  console.log("PASS: service-worker cold navigation, public-asset caching, API exclusion and sign-out locking");
  const upgradeContext = await browser.newContext();
  const upgradePage = await upgradeContext.newPage(); await upgradePage.goto(origin);
  await upgradePage.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("ca-progress-offline", 1);
      request.onupgradeneeded = () => { for (const name of ["snapshots", "mutations", "files", "meta"]) request.result.createObjectStore(name, { keyPath: "key" }); };
      request.onerror = reject;
      request.onsuccess = () => { const database = request.result; const tx = database.transaction(["snapshots", "mutations"], "readwrite"); tx.objectStore("snapshots").put({ key: "legacy:scope:dashboard", ownerId: "legacy", data: { retained: true } }); tx.objectStore("mutations").put({ key: "legacy:edit", ownerId: "legacy", idempotencyKey: "edit", body: "{}", createdAt: new Date().toISOString() }); tx.oncomplete = () => { database.close(); resolve(); }; };
    });
  });
  const upgraded = await upgradePage.evaluate(async () => { const db = await import("/lib/offline/database.js"); return { data: await db.getOfflineSnapshot("legacy", "scope:dashboard"), status: (await db.getPendingMutations("legacy"))[0].status }; });
  assert.deepEqual(upgraded, { data: { retained: true }, status: "blocked" });
  console.log("PASS: schema upgrade retains legacy snapshots and quarantines unsafe old edits");
} finally { await browser.close(); server.close(); }
