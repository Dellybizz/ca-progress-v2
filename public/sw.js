/* Cache only public build assets and the data-free offline shell. Private HTML,
   RSC payloads, API responses, avatars and file download URLs never enter Cache API. */
const BASE = "ca-progress-shell-v4";
const ROUTES = new Set(["/offline", "/dashboard", "/syllabus", "/progress", "/study", "/planner", "/notes", "/resources"]);
const blocked = url => /[?&](?:[^=]*(?:token|signature|credential)|expires)=/i.test(url.search);
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(BASE);
  const shell = await fetch("/offline", { cache: "reload" });
  if (!shell.ok || shell.redirected) throw new Error("Offline shell unavailable");
  const html = await shell.clone().text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)"/g)].map(match => match[1]))];
  await cache.addAll(assets);
  await cache.put("/offline", shell);
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("ca-progress-shell-") && name !== BASE) await caches.delete(name);
  await self.clients.claim();
})()));
async function lockOfflineIdentity() {
  await new Promise(resolve => {
    const request = indexedDB.open("ca-progress-offline");
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) { db.close(); resolve(); return; }
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").delete(JSON.stringify(["__device__", "active"]));
      tx.oncomplete = tx.onabort = () => { db.close(); resolve(); };
    };
    request.onerror = () => resolve();
  });
  for (const client of await self.clients.matchAll()) client.postMessage({ type: "OFFLINE_LOCKED" });
}
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth/") || url.pathname === "/login") {
    event.respondWith((async () => { await lockOfflineIdentity(); return fetch(request); })()); return;
  }
  if (request.method !== "GET" || blocked(url)) return;
  const navigation = request.mode === "navigate" && (ROUTES.has(url.pathname) || /^\/notes\/[0-9a-f-]{36}$/i.test(url.pathname));
  const asset = url.pathname.startsWith("/_next/static/") && ["script", "style", "font"].includes(request.destination);
  if (!navigation && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(BASE);
    try {
      const response = await fetch(request);
      if (asset && response.ok && response.type === "basic" && !response.redirected) event.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch {
      return (await cache.match(navigation ? "/offline" : request)) ?? new Response("Offline asset unavailable. Reconnect to load this page.", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});
