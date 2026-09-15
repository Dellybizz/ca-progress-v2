import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { flushPendingMutations, getOfflineIdentity, getOfflineMutationResult, getOfflineSnapshot, getPendingMutations, queueOfflineMutation } from "@/lib/offline/database";
import { conflictBaseline, entityKey, projectOfflineEdit, snapshotKind } from "@/lib/offline/projection";
export type OfflineMutationResult = { response: Response; queued: boolean; idempotencyKey: string; body: Record<string, unknown> };

export async function projectedSnapshot<T>(ownerId: string, contextKey: string, kind: string) {
  let data = await getOfflineSnapshot<T>(ownerId, `${contextKey}:${kind}`);
  for (const row of await getPendingMutations(ownerId)) {
    if (row.contextKey !== contextKey || row.status === "blocked") continue;
    const edit = JSON.parse(row.body);
    data = projectOfflineEdit(kind, data, edit.url, edit.body);
  }
  return data;
}

export async function offlineMutationFetch(ownerId: string, url: string, body: Record<string, unknown>, queuedResponse: Record<string, unknown> = {}, expectedOverride?: Record<string, unknown> | null): Promise<OfflineMutationResult> {
  if (!OFFLINE_ENABLED) return { response: await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), queued: false, idempotencyKey: "", body };
  const kind = snapshotKind(url);
  if (!kind) throw new Error("This action needs a connection.");
  const identity = await getOfflineIdentity();
  if (!ownerId || identity?.userId !== ownerId) throw new Error("Your account changed. Reopen this screen before saving.");
  const idempotencyKey = crypto.randomUUID();
  const durableBody = { ...body, ...(url === "/api/notes" ? { bodyHtml: safeLocalHtml(String(body.bodyHtml ?? "")) } : {}), clientId: idempotencyKey, offlineOccurredAt: new Date().toISOString() };
  const model = await projectedSnapshot(ownerId, identity.contextKey, kind);
  const expected = expectedOverride === undefined ? conflictBaseline(url, durableBody, model) : expectedOverride;
  const pending = await getPendingMutations(ownerId);
  const predecessor = pending.filter(row => row.contextKey === identity.contextKey && entityKey(row.url, JSON.parse(row.body).body) === entityKey(url, durableBody)).at(-1)?.idempotencyKey ?? null;
  await queueOfflineMutation({ ownerId, contextKey: identity.contextKey, idempotencyKey, url, body: JSON.stringify({ ownerId, contextKey: identity.contextKey, url, body: durableBody, expected, predecessor }) });
  // The write-ahead record exists before the network request, including online edits.
  if (navigator.onLine) await flushPendingMutations(ownerId).catch(() => undefined);
  const saved = await getOfflineMutationResult(ownerId, idempotencyKey);
  if (saved) return { response: Response.json(saved.data, { status: saved.status }), queued: false, idempotencyKey, body: durableBody };
  const row = (await getPendingMutations(ownerId)).find(row => row.idempotencyKey === idempotencyKey);
  if (row && row.status !== "pending") throw new Error(row.lastError ?? "Your edit needs review in Offline data.");
  return { response: Response.json({ queued: true, clientId: idempotencyKey, id: idempotencyKey, ...queuedResponse }, { status: 202 }), queued: true, idempotencyKey, body: durableBody };
}

function safeLocalHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "UL", "OL", "LI", "BLOCKQUOTE", "H2", "H3", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "MARK", "A", "SPAN"]);
  for (const element of [...doc.body.querySelectorAll("*")]) {
    if (!allowed.has(element.tagName)) { element.replaceWith(doc.createTextNode(element.textContent ?? "")); continue; }
    for (const attribute of [...element.attributes]) {
      const safeLink = element.tagName === "A" && attribute.name === "href" && /^(https?:|mailto:)/i.test(attribute.value) && !/[?&](?:[^=]*(?:token|signature|credential)|expires)=/i.test(attribute.value);
      const safeSpan = ["TH", "TD"].includes(element.tagName) && ["colspan", "rowspan"].includes(attribute.name) && /^[1-9]$/.test(attribute.value);
      if (!safeLink && !safeSpan) element.removeAttribute(attribute.name);
    }
  }
  return doc.body.innerHTML;
}
