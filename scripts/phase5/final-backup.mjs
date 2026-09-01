import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PHASE4_TABLES } from "../phase4/manifest.mjs";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of required) if (!process.env[key]) throw new Error(`Phase 5 final backup requires ${key}`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pageSize = Number(process.env.PHASE5_BACKUP_PAGE_SIZE || 500);
const outputDir = process.env.PHASE5_BACKUP_DIR || "phase5-backup";

function headers(extra = {}) {
  return { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, ...extra };
}

async function sourceFetch(path, init = {}) {
  return fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
}

async function fetchTable(table, order = []) {
  const rows = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ select: "*", limit: String(pageSize), offset: String(offset) });
    if (order.length) params.set("order", order.map((column) => `${column}.asc`).join(","));
    const response = await sourceFetch(`/rest/v1/${encodeURIComponent(table)}?${params}`);
    if (response.status === 404) {
      const text = await response.text();
      if (/PGRST205|Could not find the table|does not exist/i.test(text)) return null;
      throw new Error(`${table} backup fetch failed: ${response.status} ${text.slice(0, 300)}`);
    }
    if (!response.ok) throw new Error(`${table} backup fetch failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }
  return rows;
}

async function fetchAuthUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const response = await sourceFetch(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!response.ok) throw new Error(`Supabase auth backup failed: ${response.status}`);
    const body = await response.json();
    for (const user of body.users || []) {
      users.push({
        id: user.id,
        email: user.email || null,
        phone: user.phone || null,
        app_metadata: user.app_metadata || {},
        user_metadata: user.user_metadata || {},
        email_confirmed_at: user.email_confirmed_at || null,
        phone_confirmed_at: user.phone_confirmed_at || null,
        last_sign_in_at: user.last_sign_in_at || null,
        banned_until: user.banned_until || null,
        created_at: user.created_at || null,
        updated_at: user.updated_at || null,
        deleted_at: user.deleted_at || null,
      });
    }
    if (!body.next_page || body.next_page === page) break;
    page = body.next_page;
  }
  return users.sort((a, b) => a.id.localeCompare(b.id));
}

async function listStorageInventory() {
  const response = await sourceFetch("/storage/v1/bucket");
  if (!response.ok) throw new Error(`Supabase storage bucket inventory failed: ${response.status}`);
  const buckets = await response.json();
  const inventory = [];
  async function walk(bucket, prefix = "") {
    let offset = 0;
    while (true) {
      const result = await sourceFetch(`/storage/v1/object/list/${encodeURIComponent(bucket.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!result.ok) throw new Error(`Supabase storage inventory failed for ${bucket.id}: ${result.status}`);
      const page = await result.json();
      for (const item of page) {
        const name = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) inventory.push({ bucket: bucket.id, name, id: item.id, metadata: item.metadata || null, updated_at: item.updated_at || null, created_at: item.created_at || null });
        else await walk(bucket, name);
      }
      if (page.length < 100) break;
      offset += page.length;
    }
  }
  for (const bucket of buckets) await walk(bucket);
  return inventory.sort((a, b) => `${a.bucket}/${a.name}`.localeCompare(`${b.bucket}/${b.name}`));
}

const tables = {};
const tableSummary = [];
for (const spec of PHASE4_TABLES) {
  const rows = await fetchTable(spec.source, spec.pk);
  if (rows === null) {
    if (!spec.optionalSource) throw new Error(`Required backup source table ${spec.source} is absent.`);
    tables[spec.source] = null;
    tableSummary.push({ table: spec.source, status: "source_absent", count: 0 });
  } else {
    tables[spec.source] = rows;
    tableSummary.push({ table: spec.source, status: "backed_up", count: rows.length });
  }
}

const authUsers = await fetchAuthUsers();
const storageInventory = await listStorageInventory();
const payload = {
  format: "ca-progress-v2-phase5-sanitized-supabase-export-v1",
  createdAt: new Date().toISOString(),
  sourceHost: new URL(supabaseUrl).hostname,
  exclusions: [
    "password hashes",
    "refresh/access tokens",
    "session tokens",
    "provider client secrets",
    "service-role key",
  ],
  authUsers,
  tables,
  storageInventory,
};
const serialized = JSON.stringify(payload, null, 2);
const digest = createHash("sha256").update(serialized).digest("hex");
mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/supabase-logical-export.json`, serialized);
writeFileSync(`${outputDir}/manifest.json`, JSON.stringify({
  format: payload.format,
  createdAt: payload.createdAt,
  sourceHost: payload.sourceHost,
  sha256: digest,
  authUserCount: authUsers.length,
  publicRecordCount: tableSummary.reduce((sum, item) => sum + item.count, 0),
  storageObjectCount: storageInventory.length,
  tables: tableSummary,
  exclusions: payload.exclusions,
}, null, 2));
console.log(JSON.stringify({ ok: true, sha256: digest, authUsers: authUsers.length, publicRecords: tableSummary.reduce((sum, item) => sum + item.count, 0), storageObjects: storageInventory.length }));
