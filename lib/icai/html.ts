import type { ParsedOfficialLink } from "./types";

const ENTITY_MAP: Record<string, string> = { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">", nbsp: " " };
function decodeEntities(value: string) { return value.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&([a-z]+);/gi, (entity, name: string) => ENTITY_MAP[name.toLowerCase()] ?? entity); }
export function cleanText(value: string) { return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()); }
export function canonicalOfficialUrl(rawUrl: string, baseUrl: string) { try { const url = new URL(rawUrl, baseUrl); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); return url.toString(); } catch { return null; } }
export function isApprovedIcaiUrl(value: string) { try { const host = new URL(value).hostname.toLowerCase(); return host === "icai.org" || host.endsWith(".icai.org"); } catch { return false; } }
export function extractOfficialLinks(html: string, baseUrl: string): ParsedOfficialLink[] {
  const links = new Map<string, ParsedOfficialLink>(); const anchor = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi; let match: RegExpExecArray | null;
  while ((match = anchor.exec(html))) { const href = match[1] ?? match[2] ?? match[3] ?? ""; const title = cleanText(match[4] ?? ""); if (!title || title.length < 3) continue; const url = canonicalOfficialUrl(href, baseUrl); if (!url || !isApprovedIcaiUrl(url) || /^(javascript:|mailto:|tel:)/i.test(href)) continue; links.set(url, { title: title.slice(0, 500), url }); }
  return [...links.values()].sort((a, b) => a.url.localeCompare(b.url));
}
