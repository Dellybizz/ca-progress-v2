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
const MIN_DATA_TTL_SECONDS = 30;
const MAX_DATA_TTL_SECONDS = 3_600;
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

function boundedTtl(ttlSeconds: number) {
  return Math.min(MAX_DATA_TTL_SECONDS, Math.max(MIN_DATA_TTL_SECONDS, Math.floor(ttlSeconds)));
}

function metric(namespace: PublicCacheNamespace, outcome: "hit" | "miss" | "bypass" | "write" | "invalidate", ttlSeconds?: number) {
  console.info(JSON.stringify({
    event: "public_cache",
    namespace,
    outcome,
    ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
  }));
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
  const ttlSeconds = boundedTtl(input.ttlSeconds);
  const cache = edgeCache();
  if (!cache) {
    metric(input.namespace, "bypass", ttlSeconds);
    return input.load();
  }

  const version = await namespaceVersion(cache, input.namespace);
  const request = new Request(cacheUrl(input.namespace, `${BASE_VERSION}:${version}:${input.key}`));
  const hit = await cache.match(request);
  if (hit) {
    try {
      metric(input.namespace, "hit", ttlSeconds);
      return await hit.json() as T;
    } catch {
      await cache.delete(request);
    }
  }

  metric(input.namespace, "miss", ttlSeconds);
  const value = await input.load();
  await cache.put(request, new Response(JSON.stringify(value), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttlSeconds}`,
    },
  }));
  metric(input.namespace, "write", ttlSeconds);
  return value;
}

export async function invalidateSharedPublicCache(namespaces: readonly PublicCacheNamespace[] = PUBLIC_NAMESPACES) {
  const cache = edgeCache();
  if (!cache) {
    for (const namespace of namespaces) metric(namespace, "bypass");
    return;
  }
  const version = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  await Promise.all(namespaces.map(async (namespace) => {
    await cache.put(
      new Request(cacheUrl(`_version/${BASE_VERSION}`, namespace)),
      new Response(version, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": `public, max-age=${VERSION_TTL_SECONDS}`,
        },
      }),
    );
    metric(namespace, "invalidate");
  }));
}


const USER_FEATURE_TTL_SECONDS = 60;

function userFeatureCacheUrl(userId: string, featureKey: string, version: string) {
  const { appName } = getPublicRuntimeConfig();
  const safeApp = encodeURIComponent(appName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  return new URL(`https://${safeApp}.private-user-feature.invalid/${encodeURIComponent(userId)}/${encodeURIComponent(version)}/${encodeURIComponent(featureKey)}`).toString();
}

function userFeatureVersionUrl(userId: string) {
  const { appName } = getPublicRuntimeConfig();
  const safeApp = encodeURIComponent(appName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  return new URL(`https://${safeApp}.private-user-feature.invalid/_version/${encodeURIComponent(userId)}`).toString();
}

export async function getCachedUserFeature<T>(input: { userId: string; featureKey: string; load: () => Promise<T> }): Promise<T> {
  const cache = edgeCache();
  if (!cache) return input.load();
  const versionResponse = await cache.match(new Request(userFeatureVersionUrl(input.userId)));
  const version = versionResponse ? (await versionResponse.text()).trim() || BASE_VERSION : BASE_VERSION;
  const request = new Request(userFeatureCacheUrl(input.userId, input.featureKey, version));
  const hit = await cache.match(request);
  if (hit) {
    try {
      metric("pricing", "hit", USER_FEATURE_TTL_SECONDS);
      return await hit.json() as T;
    } catch {
      await cache.delete(request);
    }
  }
  metric("pricing", "miss", USER_FEATURE_TTL_SECONDS);
  const value = await input.load();
  await cache.put(request, new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `private, max-age=${USER_FEATURE_TTL_SECONDS}` },
  }));
  metric("pricing", "write", USER_FEATURE_TTL_SECONDS);
  return value;
}

export async function invalidateUserFeatureCache(userId: string) {
  const cache = edgeCache();
  if (!cache || !userId) return;
  await cache.put(new Request(userFeatureVersionUrl(userId)), new Response(`${Date.now().toString(36)}-${crypto.randomUUID()}`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": `private, max-age=${VERSION_TTL_SECONDS}` },
  }));
  metric("pricing", "invalidate");
}
