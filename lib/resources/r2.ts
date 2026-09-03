import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const RESOURCE_R2_BINDING = "USER_RESOURCES_R2";
export const RESOURCE_R2_BUCKET_NAME = "ca-progress-v2-staging-user-resources";
export const RESOURCE_R2_STORAGE_BUCKET = `r2:${RESOURCE_R2_BUCKET_NAME}`;

type R2HttpMetadata = {
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
};

export type R2ObjectBodyLike = {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
};

type ResourceR2Bucket = {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array> | Blob | string,
    options?: {
      httpMetadata?: R2HttpMetadata;
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<Omit<R2ObjectBodyLike, "body" | "writeHttpMetadata"> | null>;
  delete(key: string): Promise<void>;
};

export function getResourceR2Bucket(): ResourceR2Bucket {
  const { env } = getCloudflareContext();
  const bucket = (env as unknown as Record<string, unknown>)[RESOURCE_R2_BINDING] as ResourceR2Bucket | undefined;
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.get !== "function" || typeof bucket.head !== "function" || typeof bucket.delete !== "function") {
    throw new Error("Cloudflare R2 resource bucket binding is not configured.");
  }
  return bucket;
}

function safeExtension(extension: string) {
  const normalized = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized || normalized.length > 8) throw new Error("Invalid avatar extension.");
  return normalized;
}

export function avatarObjectPrefix(applicationUserId: string) {
  return `avatars/${applicationUserId}/`;
}

export function isOwnedAvatarObjectKey(applicationUserId: string, key: string) {
  return key.startsWith(avatarObjectPrefix(applicationUserId)) && !key.includes("..") && !key.includes("\\");
}

export function createAvatarObjectKey(applicationUserId: string, extension: string) {
  return `${avatarObjectPrefix(applicationUserId)}${crypto.randomUUID()}.${safeExtension(extension)}`;
}

export async function putAvatarObject(input: {
  applicationUserId: string;
  payload: Uint8Array;
  contentType: string;
  extension: string;
}) {
  const key = createAvatarObjectKey(input.applicationUserId, input.extension);
  await getResourceR2Bucket().put(key, input.payload, {
    httpMetadata: { contentType: input.contentType, cacheControl: "private, max-age=3600" },
    customMetadata: { owner: input.applicationUserId, kind: "avatar" },
  });
  return key;
}

export async function getOwnedAvatarObject(applicationUserId: string, key: string) {
  if (!isOwnedAvatarObjectKey(applicationUserId, key)) return null;
  return getResourceR2Bucket().get(key);
}

export async function deleteOwnedAvatarObject(applicationUserId: string, key: string | null | undefined) {
  if (!key || !isOwnedAvatarObjectKey(applicationUserId, key)) return;
  await getResourceR2Bucket().delete(key);
}
