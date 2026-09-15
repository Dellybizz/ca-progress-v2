import { projectOfflineEdit } from "@/lib/offline/projection";
export const OFFLINE_DB_NAME = "ca-progress-offline";
export const OFFLINE_SCHEMA_VERSION = 2;
const STORES = ["snapshots", "mutations", "files", "meta"] as const;
export type OfflineStore = (typeof STORES)[number];
export type OfflineMutation = {
  key: string; idempotencyKey: string; ownerId: string; contextKey: string;
  url: string; body: string; createdAt: string; order: number; attempts: number;
  nextAttemptAt: string; status: "pending" | "conflict" | "blocked"; lastError: string | null;
};
type Row = { key: string; ownerId: string; [key: string]: unknown };
export type OfflineIdentity = { userId: string; contextKey: string; context: unknown };
const ownerKey = (ownerId: string, key: string) => JSON.stringify([ownerId, key]);
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ca-progress-offline") : null;
if (channel) channel.onmessage = () => window.dispatchEvent(new Event("offline-data-change"));
const changed = () => { channel?.postMessage("changed"); if (typeof window !== "undefined") window.dispatchEvent(new Event("offline-data-change")); };

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        const store = db.objectStoreNames.contains(name) ? request.transaction!.objectStore(name) : db.createObjectStore(name, { keyPath: "key" });
        if (!store.indexNames.contains("owner")) store.createIndex("owner", "ownerId");
        // Upgrade the recovered v1 draft without losing queued work or files.
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) return;
          const row = item.value;
          if (typeof row.key === "string" && row.key.startsWith(`${row.ownerId}:`)) {
            const key = ownerKey(row.ownerId, row.key.slice(row.ownerId.length + 1));
            store.put({ ...row, key, ...(name === "mutations" ? { status: "blocked", lastError: "Legacy edit retained. Export and review before applying; it has no verified conflict baseline." } : {}) });
            item.delete();
          }
          item.continue();
        };
      }
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error("Offline storage is unavailable."));
    request.onblocked = () => reject(new Error("Close other CA Progress tabs to upgrade offline storage."));
  });
}
async function transact<T>(names: OfflineStore | OfflineStore[], mode: IDBTransactionMode, action: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Offline storage could not save this change.")); };
    try { action(tx, next => { value = next; }); } catch (error) { tx.abort(); db.close(); reject(error); }
  });
}
async function put(name: OfflineStore, row: Row) {
  await transact<void>(name, "readwrite", (tx, done) => { tx.objectStore(name).put(row); done(); });
  changed();
}
async function get<T>(name: OfflineStore, key: string): Promise<T | null> {
  return transact(name, "readonly", (tx, done) => { const request = tx.objectStore(name).get(key); request.onsuccess = () => done(request.result ?? null); });
}
async function ownerRows<T>(name: OfflineStore, ownerId: string): Promise<T[]> {
  return transact(name, "readonly", (tx, done) => { const request = tx.objectStore(name).index("owner").getAll(ownerId); request.onsuccess = () => done(request.result); });
}
export async function removeOfflineRow(name: OfflineStore, key: string) {
  await transact<void>(name, "readwrite", (tx, done) => { tx.objectStore(name).delete(key); done(); }); changed();
}
export async function setOfflineIdentity(identity: OfflineIdentity | null) {
  if (identity) await putOfflineMeta("__device__", "active", identity);
  else await removeOfflineRow("meta", ownerKey("__device__", "active"));
}
export async function getOfflineIdentity() { return getOfflineMeta<OfflineIdentity>("__device__", "active"); }

export type GuestMigrationSummary = { snapshots: number; mutations: number; files: number; duplicates: number; conflicts: number };

function mergeGuestData(accountData: unknown, guestData: unknown) {
  if (accountData === null || accountData === undefined) return { data: guestData, conflict: false };
  if (Array.isArray(accountData) && Array.isArray(guestData)) {
    const existing = new Set(accountData.map(item => item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : JSON.stringify(item)));
    return { data: [...accountData, ...guestData.filter(item => !existing.has(item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : JSON.stringify(item)))], conflict: false };
  }
  return { data: accountData, conflict: JSON.stringify(accountData) !== JSON.stringify(guestData) };
}

export async function prepareGuestAccountMigration(guestId: string, accountId: string, accountContextKey: string) {
  if (!guestId.startsWith("guest:") || !accountId || accountId.startsWith("guest:")) throw new Error("Invalid guest migration ownership.");
  const [snapshots, mutations, files] = await Promise.all([
    getOfflineSnapshots(guestId), getPendingMutations(guestId), getOfflineFiles(guestId),
  ]);
  const summary: GuestMigrationSummary = { snapshots: snapshots.length, mutations: mutations.length, files: files.length, duplicates: 0, conflicts: 0 };
  for (const snapshot of snapshots) {
    const suffix = snapshot.kind.includes(":") ? snapshot.kind.slice(snapshot.kind.lastIndexOf(":") + 1) : snapshot.kind;
    const targetKind = `${accountContextKey}:${suffix}`;
    const current = await getOfflineSnapshot(accountId, targetKind);
    const merged = mergeGuestData(current, snapshot.data);
    if (merged.conflict) summary.conflicts++;
    await put("snapshots", { ...snapshot, key: ownerKey(accountId, targetKind), ownerId: accountId, kind: targetKind, data: merged.data, migratedFrom: guestId });
  }
  for (const mutation of mutations) {
    const targetKey = ownerKey(accountId, mutation.idempotencyKey);
    if (await get("mutations", targetKey)) { summary.duplicates++; continue; }
    const envelope = JSON.parse(mutation.body) as Record<string, unknown>;
    await put("mutations", { ...mutation, key: targetKey, ownerId: accountId, contextKey: accountContextKey, body: JSON.stringify({ ...envelope, ownerId: accountId, contextKey: accountContextKey }), status: "pending", nextAttemptAt: new Date().toISOString(), migratedFrom: guestId });
  }
  for (const file of files) {
    const targetKey = ownerKey(accountId, file.id);
    if (await get("files", targetKey)) { summary.duplicates++; continue; }
    await put("files", { ...file, key: targetKey, ownerId: accountId, migratedFrom: guestId });
  }
  const migration = { guestId, accountId, accountContextKey, summary, mutationIds: mutations.map(row => row.idempotencyKey), preparedAt: new Date().toISOString() };
  await putOfflineMeta(guestId, "migration", migration);
  await putOfflineMeta(accountId, "guest-migration", migration);
  return { summary, mutationIds: mutations.map(row => row.idempotencyKey) };
}

export async function getPreparedGuestMigration(accountId: string) {
  return getOfflineMeta<{ guestId: string; accountId: string; accountContextKey: string; summary: GuestMigrationSummary; mutationIds: string[] }>(accountId, "guest-migration");
}

export function safeOfflineData(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(safeOfflineData);
  if (data && typeof data === "object") return Object.fromEntries(Object.entries(data).filter(([key]) => !/token|secret|password|signedUrl|avatarUrl|entitlements/i.test(key)).map(([key, value]) => [key, safeOfflineData(value)]));
  if (typeof data === "string" && /[?&](?:[^\s=]*(?:token|signature|credential)|expires)=/i.test(data)) return "";
  return data;
}
export async function putOfflineSnapshot(ownerId: string, kind: string, data: unknown) {
  if ((await getPendingMutations(ownerId)).some(edit => kind.startsWith(`${edit.contextKey}:`)) && await getOfflineSnapshot(ownerId, kind)) return;
  const row = { key: ownerKey(ownerId, kind), ownerId, kind, data: safeOfflineData(data), schemaVersion: OFFLINE_SCHEMA_VERSION, savedAt: new Date().toISOString() };
  try { await put("snapshots", row); } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") throw error;
    await enforceOfflineStorageLimit(ownerId, true); await put("snapshots", row);
  }
  await enforceOfflineStorageLimit(ownerId);
}
export async function getOfflineSnapshot<T>(ownerId: string, kind: string) { return (await get<{ data: T }>("snapshots", ownerKey(ownerId, kind)))?.data ?? null; }
export async function getOfflineSnapshots(ownerId: string) { return ownerRows<{ key: string; kind: string; data: unknown; savedAt: string }>("snapshots", ownerId); }
export async function queueOfflineMutation(input: Pick<OfflineMutation, "ownerId" | "contextKey" | "idempotencyKey" | "url" | "body">) {
  if (!input.ownerId || !input.contextKey) throw new Error("Sign in before saving offline edits.");
  const existing = await getPendingMutations(input.ownerId);
  if (existing.length >= 1000 || existing.reduce((bytes, row) => bytes + new TextEncoder().encode(row.body).length, new TextEncoder().encode(input.body).length) > 25 * 1024 * 1024) throw new Error("Pending edits reached this device’s 25 MB / 1,000 edit limit. Synchronize or export them before adding more.");
  const key = ownerKey(input.ownerId, input.idempotencyKey);
  await transact<void>(["mutations", "meta"], "readwrite", (tx, done) => {
    const meta = tx.objectStore("meta"), store = tx.objectStore("mutations");
    const counterKey = ownerKey(input.ownerId, "sequence");
    const request = meta.get(counterKey);
    request.onsuccess = () => {
      const order = Number(request.result?.data ?? 0) + 1;
      meta.put({ key: counterKey, ownerId: input.ownerId, data: order });
      store.add({ key, ...input, order, createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: new Date().toISOString(), status: "pending", lastError: null });
      done();
    };
  }); changed();
}
export async function getPendingMutations(ownerId: string) { return (await ownerRows<OfflineMutation>("mutations", ownerId)).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)); }
export async function getOfflineMutationResult(ownerId: string, id: string) { return getOfflineMeta<{ data: Record<string, unknown>; status: number }>(ownerId, `result:${id}`); }
export async function flushPendingMutations(ownerId: string, fetcher: typeof fetch = fetch) {
  if (!navigator.locks) throw new Error("This browser cannot safely synchronize offline edits. Export your edits or use a browser with Web Locks.");
  return navigator.locks.request("ca-progress-offline-sync", async () => {
    let completed = 0;
    const queued = await getPendingMutations(ownerId);
    if (!queued.length || queued[0].status !== "pending" || Date.parse(queued[0].nextAttemptAt) > Date.now()) return { completed, remaining: queued.length };
    const active = await getOfflineIdentity();
    if (active?.userId !== ownerId) return { completed, remaining: (await getPendingMutations(ownerId)).length };
    const auth = await fetcher("/api/offline/context", { cache: "no-store", credentials: "same-origin" });
    if (!auth.ok) return { completed, remaining: (await getPendingMutations(ownerId)).length };
    const current = await auth.json() as { userId?: string; contextKey?: string };
    if (current.userId !== ownerId) { await setOfflineIdentity(null); return { completed, remaining: (await getPendingMutations(ownerId)).length }; }
    for (const row of await getPendingMutations(ownerId)) {
      // Preserve order: dependent edits must not pass a failed/conflicted edit.
      if (row.status !== "pending" || Date.parse(row.nextAttemptAt) > Date.now()) break;
      if ((await getOfflineIdentity())?.userId !== ownerId) break;
      if (row.contextKey !== current.contextKey) { await put("mutations", { ...row, status: "conflict", lastError: "Academic selection changed. Export and review this edit." }); break; }
      try {
        const response = await fetcher("/api/offline/mutations", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": row.idempotencyKey }, body: row.body });
        if (response.redirected || !response.headers.get("Content-Type")?.includes("application/json")) throw new Error("Synchronization did not return a valid response.");
        const payload = await response.json() as Record<string, unknown>;
        if (!response.ok) {
          if (response.status === 409 || (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status))) {
            await put("mutations", { ...row, status: response.status === 409 ? "conflict" : "blocked", lastError: String(payload.error ?? "Edit requires review.") }); break;
          }
          throw new Error(String(payload.error ?? `Server returned ${response.status}.`));
        }
        const snapshots = await getOfflineSnapshots(ownerId);
        const edit = JSON.parse(row.body);
        await transact<void>(["mutations", "meta", "snapshots"], "readwrite", (tx, done) => {
          for (const snapshot of snapshots) {
            if (!snapshot.kind.startsWith(`${row.contextKey}:`)) continue;
            const kind = snapshot.kind.slice(row.contextKey.length + 1);
            tx.objectStore("snapshots").put({ ...snapshot, ownerId, data: projectOfflineEdit(kind, snapshot.data, edit.url, edit.body, payload) });
          }
          tx.objectStore("meta").put({ key: ownerKey(ownerId, `result:${row.idempotencyKey}`), ownerId, updatedAt: new Date().toISOString(), data: { data: payload, status: response.status } });
          tx.objectStore("mutations").delete(row.key); done();
        }); completed++; changed();
      } catch (error) {
        const attempts = row.attempts + 1;
        const delay = Math.min(3_600_000, 2 ** Math.min(attempts, 12) * 1000);
        await put("mutations", { ...row, attempts, nextAttemptAt: new Date(Date.now() + delay).toISOString(), lastError: error instanceof Error ? error.message : "Synchronization failed." }); break;
      }
    }
    const results = (await ownerRows<{ key: string; updatedAt?: string }>("meta", ownerId)).filter(row => JSON.parse(row.key)[1].startsWith("result:"));
    for (const row of results.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(100)) await removeOfflineRow("meta", row.key);
    if (completed) await putOfflineMeta(ownerId, "last-sync", { at: new Date().toISOString(), completed });
    return { completed, remaining: (await getPendingMutations(ownerId)).length };
  });
}
export async function putOfflineMeta(ownerId: string, name: string, data: unknown) { await put("meta", { key: ownerKey(ownerId, name), ownerId, name, data, updatedAt: new Date().toISOString() }); }
export async function getOfflineMeta<T>(ownerId: string, name: string) { return (await get<{ data: T }>("meta", ownerKey(ownerId, name)))?.data ?? null; }
export async function saveOfflineFile(ownerId: string, id: string, file: Blob, metadata: unknown) {
  if (file.size > 50 * 1024 * 1024) throw new Error("Choose a file smaller than 50 MB for offline use.");
  const files = await ownerRows<{ id: string; file: Blob }>("files", ownerId);
  if (files.reduce((size, row) => size + (row.id === id ? 0 : row.file.size), file.size) > 200 * 1024 * 1024) throw new Error("Offline downloads reached 200 MB. Remove a download first.");
  await put("files", { key: ownerKey(ownerId, id), ownerId, id, file, metadata: safeOfflineData(metadata), savedAt: new Date().toISOString() });
}
export async function getOfflineFiles(ownerId: string) { return ownerRows<{ key: string; id: string; file: Blob; metadata: { title?: string } }>("files", ownerId); }
export async function clearOfflineOwner(ownerId: string) {
  await transact<void>([...STORES], "readwrite", (tx, done) => {
    for (const name of STORES) { const request = tx.objectStore(name).index("owner").openCursor(IDBKeyRange.only(ownerId)); request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } }; }
    done();
  }); changed();
}
export async function exportOfflineOwner(ownerId: string) {
  const result: Record<string, unknown[]> = {};
  for (const name of STORES) result[name] = (await ownerRows<Row>(name, ownerId)).map(({ file, ...row }) => ({ ...row, ...(file ? { file: { size: (file as Blob).size, type: (file as Blob).type, note: "Download this file separately from Offline files." } } : {}) }));
  return { schemaVersion: OFFLINE_SCHEMA_VERSION, ownerId, exportedAt: new Date().toISOString(), stores: result };
}
export async function offlineStorageEstimate() { const estimate = await navigator.storage?.estimate?.(); return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 }; }
export async function enforceOfflineStorageLimit(ownerId: string, force = false) {
  const estimate = await offlineStorageEstimate();
  const rows = await getOfflineSnapshots(ownerId);
  if (!force && rows.length <= 30 && (!estimate.quota || estimate.usage / estimate.quota < 0.8)) return;
  // Only derived snapshots may be evicted, never edits or explicit downloads.
  const pending = await getPendingMutations(ownerId);
  for (const row of rows.sort((a, b) => a.savedAt.localeCompare(b.savedAt)).slice(0, Math.max(0, rows.length - (force ? 0 : 7)))) {
    if (!pending.some(edit => row.kind.startsWith(`${edit.contextKey}:`))) await removeOfflineRow("snapshots", row.key);
  }
}
