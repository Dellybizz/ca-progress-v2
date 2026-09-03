import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { RESOURCE_R2_BUCKET_NAME } from "./r2";

type PresignConfig = { accountId: string; accessKeyId: string; secretAccessKey: string; endpoint?: string };

function config(): PresignConfig {
  const { env } = getCloudflareContext();
  const values = env as unknown as Record<string, unknown>;
  const accountId = String(values.R2_ACCOUNT_ID ?? "").trim();
  const accessKeyId = String(values.R2_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = String(values.R2_SECRET_ACCESS_KEY ?? "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error("R2 signed URL credentials are not configured.");
  return { accountId, accessKeyId, secretAccessKey, endpoint: typeof values.R2_S3_ENDPOINT === "string" ? values.R2_S3_ENDPOINT : undefined };
}

function hex(buffer: ArrayBuffer | Uint8Array) {\n  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);\n  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");\n}
async function sha256(value: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
async function hmac(key: ArrayBuffer | Uint8Array, value: string) {
  const material = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(value)));
}
function encoded(value: string) { return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
function objectPath(key: string) { return `/${RESOURCE_R2_BUCKET_NAME}/${key.split("/").map(encoded).join("/")}`; }

export async function createR2PresignedUrl(input: { key: string; method: "GET" | "PUT"; expiresInSeconds?: number; contentType?: string }) {
  const cfg = config();
  const endpoint = (cfg.endpoint || `https://${cfg.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
  const url = new URL(endpoint);
  const region = "auto";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const date = amzDate.slice(0, 8);
  const credential = `${cfg.accessKeyId}/${date}/${region}/s3/aws4_request`;
  const expires = Math.max(30, Math.min(900, Math.round(input.expiresInSeconds ?? 300)));
  const headersToSign = input.method === "PUT" ? "content-type;host" : "host";
  const signedHeaders: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": headersToSign,
  };
  const query = Object.entries(signedHeaders).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encoded(key)}=${encoded(value)}`).join("&");
  const canonicalHeaders = input.method === "PUT" ? `content-type:${input.contentType ?? "application/octet-stream"}\nhost:${url.host}\n` : `host:${url.host}\n`;
  const canonicalRequest = [input.method, objectPath(input.key), query, canonicalHeaders, headersToSign, "UNSIGNED-PAYLOAD"].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonicalRequest)].join("\n");
  const kDate = await hmac(new TextEncoder().encode(`AWS4${cfg.secretAccessKey}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  const signedUrl = `${endpoint}${objectPath(input.key)}?${query}&X-Amz-Signature=${signature}`;
  return { url: signedUrl, expiresAt: new Date(now.getTime() + expires * 1000).toISOString() };
}
