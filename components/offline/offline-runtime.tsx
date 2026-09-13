"use client";
import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { useEffect, useState } from "react";
import { clearOfflineOwner, flushPendingMutations, getOfflineIdentity, getPendingMutations, getPreparedGuestMigration, prepareGuestAccountMigration, setOfflineIdentity } from "@/lib/offline/database";
import { clearGuestIdentity, getOrCreateGuestIdentity } from "@/lib/auth/guest";
import { useStudentContext } from "@/components/academic/student-context-provider";

export function OfflineRuntime() {
  const context = useStudentContext();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!OFFLINE_ENABLED) return;
    let cancelled = false;
    const ready = (async () => {
      if (context.mode === "guest") {
        const response = await fetch("/api/offline/context", { cache: "no-store", credentials: "same-origin" });
        const server = response.ok ? await response.json() as { guestId?: string; contextKey?: string } : null;
        const guest = getOrCreateGuestIdentity(server?.guestId ?? null);
        return setOfflineIdentity({ userId: guest.id, contextKey: server?.contextKey ?? "guest:en-IN", context: { mode: "guest" } });
      }
      if (!context.userId) return setOfflineIdentity(null);
      const prior = await getOfflineIdentity();
      let migration = await getPreparedGuestMigration(context.userId);
      if (prior?.userId.startsWith("guest:")) migration = { guestId: prior.userId, accountId: context.userId, accountContextKey: context.contextKey, ...(await prepareGuestAccountMigration(prior.userId, context.userId, context.contextKey)) };
      await setOfflineIdentity({ userId: context.userId, contextKey: context.contextKey, context: { ...context, entitlements: [] } });
      if (!migration || !navigator.onLine) return;
      const approved = window.confirm(`Preserve your guest work in this account?\n\n${migration.summary.snapshots} saved screens · ${migration.summary.mutations} pending edits · ${migration.summary.files} downloaded files\n\nExisting account data will be kept. Any conflicts will wait for your review.`);
      if (!approved) throw new Error("Your guest data is still stored on this device. You can preserve it after your next sign-in.");
      const send = async (body: Record<string, unknown>) => {
        const response = await fetch("/api/offline/guest-migration", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId: migration!.guestId, ...body }) });
        const data = await response.json() as Record<string, unknown>;
        if (!response.ok) throw new Error(String(data.error ?? "Guest data migration is waiting to resume."));
        return data;
      };
      await send({ action: "start", summary: migration.summary });
      for (let offset = 0; offset < migration.mutationIds.length; offset += 100) await send({ action: "register", mutationIds: migration.mutationIds.slice(offset, offset + 100) });
      await flushPendingMutations(context.userId);
      const unresolved = (await getPendingMutations(context.userId)).filter(row => migration!.mutationIds.includes(row.idempotencyKey));
      await send({ action: "complete", conflictCount: unresolved.length });
      await clearOfflineOwner(migration.guestId);
      clearGuestIdentity();
    })();
    ready.catch(() => { if (!cancelled) setError("Offline storage is unavailable. Changes cannot be saved on this device."); });
    navigator.serviceWorker?.register("/sw.js", { updateViaCache: "none" }).then(registration => registration.update()).catch(() => { if (!cancelled) setError("Offline page loading could not be enabled. Keep this tab open while offline."); });
    const sync = async () => { await ready; if (!cancelled && context.userId && navigator.onLine) await flushPendingMutations(context.userId); };
    const update = () => void sync().catch(() => undefined);
    const click = (event: MouseEvent) => {
      if (navigator.onLine || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element)?.closest?.("a");
      if (link && !link.target && !link.download && new URL(link.href).origin === location.origin) { event.preventDefault(); location.assign(link.href); }
    };
    const signout = (event: Event) => {
      const form = event.target as HTMLFormElement;
      if (form.action && new URL(form.action).pathname === "/auth/signout") void setOfflineIdentity(null);
    };
    const verifyOwner = () => void getOfflineIdentity().then(identity => { if (!cancelled && context.userId && identity?.userId !== context.userId) location.replace("/offline"); }).catch(() => undefined);
    const storageError = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("offline-storage-error", storageError);
    window.addEventListener("offline-data-change", verifyOwner);
    window.addEventListener("online", update);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", signout, true);
    const interval = window.setInterval(update, 15_000);
    update();
    return () => { cancelled = true; window.removeEventListener("offline-storage-error", storageError); window.removeEventListener("offline-data-change", verifyOwner); window.clearInterval(interval); window.removeEventListener("online", update); document.removeEventListener("click", click, true); document.removeEventListener("submit", signout, true); };
  }, [context]);
  return error ? <p role="status">{error}</p> : null;
}
