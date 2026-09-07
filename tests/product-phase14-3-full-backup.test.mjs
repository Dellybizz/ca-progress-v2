import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildOwnedBackupPageSql,
  FULL_BACKUP_BATCH_SIZE,
  FULL_BACKUP_DATASETS,
  FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES,
  FULL_BACKUP_MAX_BATCH_SIZE,
  iterateOwnedBackupDatasetPages,
  OWNED_RESOURCE_FILES_FIRST_PAGE_SQL,
  OWNED_RESOURCE_FILES_NEXT_PAGE_SQL,
  OWNED_TEST_FILES_FIRST_PAGE_SQL,
  OWNED_TEST_FILES_NEXT_PAGE_SQL,
} from "../lib/exports/backup-data.mjs";
import { canUseExport } from "../lib/exports/policy.mjs";
import { generateTarChunks, sanitizeTarPath, textTarEntry } from "../lib/exports/tar.mjs";

const BACKUP_ROUTE = "app/api/exports/backup/route.ts";
const SETTINGS_PAGE = "app/(student)/settings/page.tsx";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

async function collectBytes(iterator) {
  const chunks = [];
  let size = 0;
  for await (const chunk of iterator) {
    chunks.push(chunk);
    size += chunk.length;
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function tarNames(bytes) {
  const decoder = new TextDecoder();
  const names = [];
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = decoder.decode(header);
    const name = text.slice(0, 100).replace(/\0.*$/, "");
    const prefix = text.slice(345, 500).replace(/\0.*$/, "");
    const sizeText = text.slice(124, 136).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    names.push(prefix ? `${prefix}/${name}` : name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

function fakeDatasetDb(sourceRows, dataset) {
  const binds = [];
  return {
    binds,
    prepare(sql) {
      assert.match(sql, new RegExp(`FROM ${dataset.table}`));
      assert.match(sql, new RegExp(`WHERE ${dataset.ownerColumn}=\\?1`));
      assert.doesNotMatch(sql, /\bOFFSET\b/i);
      return {
        bind(...values) {
          binds.push(values);
          return {
            async all() {
              const cursor = values.length === 3 ? values[1] : null;
              const limit = values.at(-1);
              const rows = sourceRows
                .filter((row) => row.owner === values[0] && (cursor === null || row.__backup_rowid > cursor))
                .sort((a, b) => a.__backup_rowid - b.__backup_rowid)
                .slice(0, limit)
                .map(({ owner: _owner, ...row }) => row);
              return { results: rows };
            },
          };
        },
      };
    },
  };
}

test("Phase 14.3 Premium backup entitlement is Premium-only", () => {
  assert.equal(canUseExport("free", "full_backup"), false);
  assert.equal(canUseExport("basic", "full_backup"), false);
  assert.equal(canUseExport("pro", "full_backup"), true);
});

test("full backup uses an explicit safe D1 allowlist with bounded keyset pagination", () => {
  assert.equal(FULL_BACKUP_BATCH_SIZE, 250);
  assert.equal(FULL_BACKUP_MAX_BATCH_SIZE, 500);
  assert.ok(FULL_BACKUP_DATASETS.length >= 35);
  assert.equal(new Set(FULL_BACKUP_DATASETS.map((dataset) => dataset.key)).size, FULL_BACKUP_DATASETS.length);

  const forbiddenColumns = new Set(["storage_path", "storage_bucket", "object_key", "idempotency_key", "provider_payment_id", "provider_order_id"]);
  for (const dataset of FULL_BACKUP_DATASETS) {
    assert.ok(dataset.columns.length > 0, `${dataset.key} must have explicit columns`);
    assert.ok(dataset.columns.every((column) => !forbiddenColumns.has(column)), `${dataset.key} contains an internal column`);
    for (const cursor of [null, 123]) {
      const sql = buildOwnedBackupPageSql({ dataset, cursor });
      assert.match(sql, new RegExp(`WHERE ${dataset.ownerColumn}=\\?1`));
      assert.match(sql, /ORDER BY rowid ASC/);
      assert.doesNotMatch(sql, /SELECT\s+\*/i);
      assert.doesNotMatch(sql, /\bOFFSET\b/i);
    }
  }
});

test("full backup paginates thousands of owned rows without omissions or cross-user leakage", async () => {
  const dataset = FULL_BACKUP_DATASETS.find((entry) => entry.key === "tasks");
  assert.ok(dataset);
  const rows = Array.from({ length: 2505 }, (_, index) => ({
    __backup_rowid: index + 1,
    owner: "owner-1",
    id: `task-${String(index).padStart(5, "0")}`,
    user_id: "owner-1",
  }));
  rows.splice(1300, 0, { __backup_rowid: 9000, owner: "owner-2", id: "other-user-secret", user_id: "owner-2" });
  const db = fakeDatasetDb(rows, dataset);
  const ids = [];
  for await (const page of iterateOwnedBackupDatasetPages(db, "owner-1", dataset, { batchSize: 500 })) {
    ids.push(...page.map((row) => row.id));
  }
  assert.equal(ids.length, 2505);
  assert.equal(new Set(ids).size, 2505);
  assert.equal(ids.includes("other-user-secret"), false);
  assert.equal(db.binds.length, 6);
  assert.ok(db.binds.every((bind) => bind[0] === "owner-1"));
});

test("full backup zero-row datasets are valid and oversized batches are clamped", async () => {
  const dataset = FULL_BACKUP_DATASETS[0];
  const empty = fakeDatasetDb([], dataset);
  const pages = [];
  for await (const page of iterateOwnedBackupDatasetPages(empty, "owner-1")) pages.push(page);
  assert.deepEqual(pages, [[]]);

  const one = fakeDatasetDb([{ __backup_rowid: 1, owner: "owner-1", user_id: "owner-1" }], dataset);
  for await (const _page of iterateOwnedBackupDatasetPages(one, "owner-1", dataset, { batchSize: 50_000 })) {}
  assert.equal(one.binds[0].at(-1), 500);
  await assert.rejects(async () => {
    for await (const _page of iterateOwnedBackupDatasetPages(empty, "", dataset)) {}
  }, /Authenticated user id is required/);
});

test("R2 file discovery is ownership-scoped and locators stay outside public datasets", () => {
  for (const sql of [OWNED_RESOURCE_FILES_FIRST_PAGE_SQL, OWNED_RESOURCE_FILES_NEXT_PAGE_SQL]) {
    assert.match(sql, /FROM uploaded_resources/);
    assert.match(sql, /WHERE owner_user_id=\?1/);
    assert.doesNotMatch(sql, /\bOFFSET\b/i);
  }
  for (const sql of [OWNED_TEST_FILES_FIRST_PAGE_SQL, OWNED_TEST_FILES_NEXT_PAGE_SQL]) {
    assert.match(sql, /FROM test_attempt_attachments/);
    assert.match(sql, /WHERE user_id=\?1/);
    assert.doesNotMatch(sql, /\bOFFSET\b/i);
  }

  const exportedColumns = FULL_BACKUP_DATASETS.flatMap((dataset) => dataset.columns);
  assert.equal(exportedColumns.includes("storage_path"), false);
  assert.equal(exportedColumns.includes("storage_bucket"), false);
  assert.equal(exportedColumns.includes("object_key"), false);
  assert.ok(FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES.includes("test_attachment_upload_intents"));
  assert.ok(FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES.includes("resource_upload_reservations"));
  assert.ok(FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES.includes("anti_cheat_flags"));
});

test("streaming TAR is deterministic, validly terminated, and path-traversal safe", async () => {
  async function* entries() {
    yield textTarEntry("../../private/../notes.txt", "hello", { mtime: 1_700_000_000 });
    yield textTarEntry("data/profile/000001.jsonl", '{"name":"लेखा"}\n', { mtime: 1_700_000_000 });
  }
  const first = await collectBytes(generateTarChunks(entries(), { mtime: 1_700_000_000 }));
  const second = await collectBytes(generateTarChunks(entries(), { mtime: 1_700_000_000 }));
  assert.deepEqual(first, second);
  assert.equal(first.length % 512, 0);
  assert.ok(first.subarray(-1024).every((byte) => byte === 0));
  const names = tarNames(first);
  assert.deepEqual(names, ["private/notes.txt", "data/profile/000001.jsonl"]);
  assert.equal(names.some((name) => name.includes("..") || name.startsWith("/")), false);
  assert.equal(sanitizeTarPath("..\\..\\secret.txt"), "secret.txt");
});

test("backup implementation never serializes private storage locators or signed URLs", () => {
  const backup = read("lib/exports/backup.ts");
  assert.doesNotMatch(backup, /\.\.\.row/);
  assert.match(backup, /storage_locators_exported: false/);
  assert.match(backup, /signed_urls_exported: false/);
  assert.doesNotMatch(backup, /createR2PresignedUrl|signed\.url|R2_ACCESS_KEY|R2_SECRET|R2_S3_ENDPOINT/);
  assert.match(backup, /getResourceR2Bucket/);
});

test("Premium backup route is private, fail-closed, and requester-owned only", () => {
  const route = read(BACKUP_ROUTE);
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /const user = await optionalUser\(\)/);
  assert.match(route, /billing\.mode !== "ready"/);
  assert.match(route, /canUseExport\(tier, "full_backup"\)/);
  assert.match(route, /createOwnedFullBackupStream\(user\.id\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.match(route, /application\/x-tar/);
  assert.match(route, /ca-progress-full-backup\.tar/);
  assert.match(route, /private, no-store/);
  assert.match(route, /Vary: "Cookie"/);
  assert.match(route, /same-origin/);
  assert.doesNotMatch(route, /searchParams|request\.url|request\.json|userId/);
});

test("Settings enables Full Backup only through the Premium entitlement", () => {
  const settings = read(SETTINGS_PAGE);
  assert.match(settings, /const canExportBackup = billingReady && canUseExport\(tier, "full_backup"\)/);
  assert.match(settings, /canExportBackup \? <a href="\/api\/exports\/backup" download>Full Backup<\/a>/);
  assert.match(settings, /Full Backup · Premium/);
});

test("Phase 14.3 does not introduce Phase 15 implementation files", () => {
  assert.equal(fs.existsSync("docs/CA_PROGRESS_PRODUCT_PHASE15_STATUS.md"), false);
});
