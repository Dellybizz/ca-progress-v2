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

type R2ObjectBodyLike = {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
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
  delete(key: string): Promise<void>;
};

export function getResourceR2Bucket(): ResourceR2Bucket {
  const { env } = getCloudflareContext();
  const bucket = (env as unknown as Record<string, unknown>)[RESOURCE_R2_BINDING] as ResourceR2Bucket | undefined;
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.get !== "function" || typeof bucket.delete !== "function") {
    throw new Error("Cloudflare R2 resource bucket binding is not configured.");
  }
  return bucket;
}
