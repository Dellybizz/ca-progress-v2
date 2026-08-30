import "server-only";

export const RESOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const RESOURCE_BUCKET = "user-resources";
export const SIGNED_URL_SECONDS = 120;

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "blockquote", "a", "h2", "h3", "code", "pre"]);

export type ValidatedUpload = {
  bytes: Uint8Array;
  extension: string;
  mimeType: string;
  safeFilename: string;
  sizeBytes: number;
};

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function normalizeFilename(name: string) {
  const extension = extensionOf(name);
  const base = name.slice(0, Math.max(0, name.length - (extension ? extension.length + 1 : 0)))
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/[._ -]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "resource";
  return extension ? `${base}.${extension}` : base;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function magicMatches(extension: string, bytes: Uint8Array) {
  if (extension === "pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === "png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === "jpg" || extension === "jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (extension === "webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  if (extension === "doc") return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (extension === "docx") return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
  return false;
}

export async function validateUploadFile(file: File): Promise<ValidatedUpload> {
  if (!(file instanceof File)) throw new Error("A file is required.");
  if (!file.name || file.name.length > 180) throw new Error("File name is invalid.");
  if (file.size <= 0) throw new Error("Empty files are not allowed.");
  if (file.size > RESOURCE_MAX_BYTES) throw new Error("File exceeds the 10 MB Phase 7 limit.");

  const extension = extensionOf(file.name);
  const acceptedMimes = MIME_BY_EXTENSION[extension];
  if (!acceptedMimes) throw new Error("File type is not allowed. Use PDF, JPG, PNG, WebP, DOC or DOCX.");
  if (!acceptedMimes.includes(file.type)) throw new Error("File MIME type does not match the allowed extension.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!magicMatches(extension, bytes)) throw new Error("File signature does not match its declared type.");

  return { bytes, extension, mimeType: file.type, safeFilename: normalizeFilename(file.name), sizeBytes: file.size };
}

function safeHref(raw: string) {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  return /^(https?:\/\/|mailto:)/i.test(value) ? value.replace(/"/g, "&quot;") : "";
}

export function sanitizeRichTextHtml(input: string) {
  const bounded = input.slice(0, 200000);
  const withoutDangerousBlocks = bounded.replace(/<(script|style|iframe|object|embed|form|input|button|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  return withoutDangerousBlocks.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, rawTag: string, rawAttrs: string) => {
    const closing = /^<\//.test(full);
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (closing) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const hrefMatch = rawAttrs.match(/href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i);
      const href = hrefMatch ? safeHref(hrefMatch[1]) : "";
      return href ? `<a href="${href}" rel="noopener noreferrer">` : "<a>";
    }
    return `<${tag}>`;
  });
}

export function richTextToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/li>|<\/h2>|<\/h3>|<\/blockquote>|<\/pre>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 120000);
}

export function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 32);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 12) break;
  }
  return tags;
}

export function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function nullableId(value: unknown) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next && next !== "none" ? next.slice(0, 160) : null;
}
