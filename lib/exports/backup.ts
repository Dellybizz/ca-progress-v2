import "server-only";

import { getPrivateResourceObject } from "@/lib/resources/r2";
import {
  FULL_BACKUP_DATASETS,
  FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES,
  iterateOwnedBackupDatasetPages,
  iterateOwnedResourceFileRows,
  iterateOwnedTestFileRows,
} from "./backup-data.mjs";
import { generateTarChunks, sanitizeTarPath, textTarEntry } from "./tar.mjs";

type BackupDatabase = Parameters<typeof iterateOwnedBackupDatasetPages>[0];
type BackupOptions = { generatedAt?: string; batchSize?: number };
type InternalFileRow = Record<string, unknown> & { __backup_rowid?: number };

const encoder = new TextEncoder();

function cleanArchiveLeaf(value: unknown, fallback: string) {
  const clean = String(value ?? "")
    .replace(/[\\/]+/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim();
  return clean || fallback;
}

function jsonEntry(path: string, value: unknown, mtime: number) {
  return textTarEntry(path, `${JSON.stringify(value, null, 2)}\n`, { mtime });
}

function jsonlEntry(path: string, rows: unknown[], mtime: number) {
  const text = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  return textTarEntry(path, text, { mtime });
}

function safeResourceMetadata(row: InternalFileRow, path: string, included: boolean) {
  return {
    id: row.id,
    original_filename: row.original_filename,
    safe_filename: row.safe_filename,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes ?? 0),
    created_at: row.created_at,
    archive_path: included ? path : null,
    included,
  };
}

function safeTestMetadata(row: InternalFileRow, path: string, included: boolean) {
  return {
    id: row.id,
    attempt_id: row.attempt_id,
    attachment_kind: row.attachment_kind,
    filename: row.filename,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes ?? 0),
    created_at: row.created_at,
    archive_path: included ? path : null,
    included,
  };
}

function binaryTarEntry(path: string, object: { size: number; body: ReadableStream<Uint8Array> }, mtime: number) {
  return { path: sanitizeTarPath(path), size: Number(object.size), body: object.body, mtime };
}

async function* generateOwnedFullBackupEntries(db: BackupDatabase, userId: string, options: BackupOptions = {}) {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("Authenticated user id is required for exports.");
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const parsedTime = Date.parse(generatedAt);
  if (!Number.isFinite(parsedTime)) throw new Error("Full backup timestamp must be a valid ISO date.");
  const mtime = Math.floor(parsedTime / 1000);
  const datasetSummary: Array<{ key: string; rows: number; parts: number }> = [];
  const fileSummary = { resources: 0, test_attachments: 0, missing_objects: 0 };
  const warnings: Array<{ kind: string; record_id: unknown; code: string }> = [];
  let omittedWarningCount = 0;

  yield jsonEntry("README.json", {
    format: "CA Progress Full Backup",
    schema: "ca-progress-backup-v1",
    product_plan: "Premium",
    generated_at: generatedAt,
    note: "manifest.json is written at the end after all streamed data and private files are processed.",
  }, mtime);

  for (const dataset of FULL_BACKUP_DATASETS) {
    let rows = 0;
    let parts = 0;
    for await (const page of iterateOwnedBackupDatasetPages(db, userId, dataset, { batchSize: options.batchSize })) {
      if (!page.length) continue;
      rows += page.length;
      parts += 1;
      yield jsonlEntry(`data/${dataset.key}/${String(parts).padStart(6, "0")}.jsonl`, page, mtime);
    }
    datasetSummary.push({ key: dataset.key, rows, parts });
  }

  for await (const row of iterateOwnedResourceFileRows(db, userId, { batchSize: options.batchSize })) {
    const id = cleanArchiveLeaf(row.id, "resource");
    const filename = cleanArchiveLeaf(row.safe_filename ?? row.original_filename, "file");
    const archivePath = sanitizeTarPath(`files/resources/${id}-${filename}`);
    const object = typeof row.storage_path === "string" ? await getPrivateResourceObject(row.storage_path) : null;
    const included = Boolean(object);
    yield jsonEntry(`data/uploaded-resources/${id}.json`, safeResourceMetadata(row, archivePath, included), mtime);
    if (!object) {
      fileSummary.missing_objects += 1;
      if (warnings.length < 100) warnings.push({ kind: "resource", record_id: row.id, code: "private_object_missing" });
      else omittedWarningCount += 1;
      continue;
    }
    fileSummary.resources += 1;
    yield binaryTarEntry(archivePath, object, mtime);
  }

  for await (const row of iterateOwnedTestFileRows(db, userId, { batchSize: options.batchSize })) {
    const id = cleanArchiveLeaf(row.id, "attachment");
    const filename = cleanArchiveLeaf(row.filename, "file");
    const archivePath = sanitizeTarPath(`files/test-attachments/${id}-${filename}`);
    const object = typeof row.object_key === "string" ? await getPrivateResourceObject(row.object_key) : null;
    const included = Boolean(object);
    yield jsonEntry(`data/test-attachments/${id}.json`, safeTestMetadata(row, archivePath, included), mtime);
    if (!object) {
      fileSummary.missing_objects += 1;
      if (warnings.length < 100) warnings.push({ kind: "test_attachment", record_id: row.id, code: "private_object_missing" });
      else omittedWarningCount += 1;
      continue;
    }
    fileSummary.test_attachments += 1;
    yield binaryTarEntry(archivePath, object, mtime);
  }

  yield jsonEntry("manifest.json", {
    schema: "ca-progress-backup-v1",
    generated_at: generatedAt,
    product_plan: "Premium",
    datasets: datasetSummary,
    files: fileSummary,
    warnings,
    omitted_warning_count: omittedWarningCount,
    privacy: {
      ownership: "Authenticated requester only",
      storage_locators_exported: false,
      signed_urls_exported: false,
      operational_tables_excluded: FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES,
      cross_user_moderation_records_excluded: true,
    },
  }, mtime);
}

export async function* generateOwnedFullBackupTarChunks(db: BackupDatabase, userId: string, options: BackupOptions = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const mtime = Math.floor(Date.parse(generatedAt) / 1000);
  yield* generateTarChunks(generateOwnedFullBackupEntries(db, userId, { ...options, generatedAt }), { mtime });
}

export function fullBackupContentLengthForText(text: string) {
  return encoder.encode(text).length;
}
