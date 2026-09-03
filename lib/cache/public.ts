import "server-only";

import { getPublicRuntimeConfig } from "@/lib/env";

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
};

type CacheStorageLike = { default?: EdgeCache };

const BASE_VERSION = "v1";
const VERSION_TTL_SECONDS = 31_536_000;
const PUBLIC_NAMESPACES = ["academic", "pricing", "icai"] as const;
export type PublicCacheNamespace = (typeof PUBLIC_NAMESPACES)[number];

function edgeCache(): EdgeCache | null {
  const storage = (globalThis as typeof globalThis & { caches?: CacheStorageLike }).caches;
  return storage?.default ?? null;
}

function cacheUrl(namespace: string, key: string) {
  const { appName } = getPublicRuntimeConfig();
  const safeApp = encodeURIComponent(appName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  return new URL(`https://${safeApp}.public-cache.invalid/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`).toString();
}

async function namespaceVersion(cache: EdgeCache, namespace: PublicCacheNamespace) {
  const request = new Request(cacheUrl(`_version/${BASE_VERSION}`, namespace));
  const response = await cache.match(request);
  if (!response) return BASE_VERSION;
  const value = (await response.text()).trim();
  return value || BASE_VERSION;
}

export async function getSharedPublicJson<T>(input: {
  namespace: PublicCacheNamespace;
  key: string;
  ttlSeconds: number;
  load: () => Promise<T>;
}): Promise<T> {
  const cache = edgeCache();
  if (!cache) return input.load();

  const version = await namespaceVersion(cache, input.namespace);
  const request = new Request(cacheUrl(input.namespace, `${BASE_VERSION}:${version}:${input.key}`));
  const hit = await cache.match(request);
  if (hit) {
    try {
      return await hit.json() as T;
    } catch {
      await cache.delete(request);
    }
  }

  const value = await input.load();
  await cache.put(request, new Response(JSON.stringify(value), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${Math.max(1, Math.floor(input.ttlSeconds))}`,
    },
  }));
  return value;
}

export async function invalidateSharedPublicCache(namespaces: readonly PublicCacheNamespace[] = PUBLIC_NAMESPACES) {
  const cache = edgeCache();
  if (!cache) return;
  const version = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  await Promise.all(namespaces.map((namespace) => cache.put(
    new Request(cacheUrl(`_version/${BASE_VERSION}`, namespace)),
    new Response(version, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": `public, max-age=${VERSION_TTL_SECONDS}`,
      },
    }),
  )));
}
