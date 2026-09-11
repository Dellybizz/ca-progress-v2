import { getDocumentProxy } from "unpdf";
import { extractOfficialLinks, isApprovedIcaiUrl } from "../../lib/icai/html";
import { detectLevels } from "../../lib/icai/classify";
import { sha256Hex, stableJson } from "../../lib/icai/hash";
import { parseExamSchedule, scheduleAttemptKeys, type ExamSubject } from "../../lib/icai/exam-schedule";
import type { IcaiSourceConfig, ParsedSourcePayload } from "../../lib/icai/types";
import type { D1Database } from "./d1-client";

const VERSION = "exam-schedule-v1";
const MAX_BYTES = 6_000_000;
const MAX_FETCHES = 24;
const IGNORE = /\b(results?|mock|mtp|rtp|class(?:es)?|coaching|study material|lecture|webinar|success|sucess|fees?|exemption|admit|application|forms?|registration|eligibility|requirements|answer|copies|specimen|assessment|ICITSS|SPOM|only|city master|centre master|fee chart|important dates)\b/i;
const SCHEDULE = /\b(exams?|examinations?|schedule|timetable|date\s*sheet|guidance)\b/i;
type Entry = { url: string; title: string; depth: number; root?: boolean };
type CacheRow = { etag: string | null; last_modified: string | null; payload: string; parser_version: string };

export async function extractSchedulePdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes, { useSystemFonts: false });
  try {
    if (pdf.numPages > 64) throw new Error("Official timetable exceeded the 64-page document limit.");
    // Timetable sections are near the front of guidance PDFs. Bound extraction
    // independently of later application instructions and centre listings.
    const pages: string[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, 8); number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""));
      page.cleanup();
    }
    const text = pages.join("\n");
    if (!text.trim()) throw new Error("Official PDF has no extractable text; manual review is required.");
    return text;
  } finally { await pdf.loadingTask.destroy(); }
}

async function readBounded(response: Response) {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Official timetable exceeds the download limit.");
  if (!response.body) throw new Error("Official timetable response is empty.");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Official timetable exceeds the download limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function resolveExamSchedules(
  rootHtml: string, source: IcaiSourceConfig, subjects: ExamSubject[], db: D1Database,
  userAgent: string, checkpoint: (url: string) => Promise<void>, skippedUrls = new Set<string>(),
  fetcher: typeof fetch = fetch, now = new Date(),
): Promise<ParsedSourcePayload> {
  const floor = now.toISOString().slice(0, 7);
  const deadline = Date.now() + 95_000;
  const queue: Entry[] = [{ url: source.officialUrl, title: source.name, depth: 0, root: true }, { url: "https://boslive.icai.org/examination_announcement.php", title: "Examination announcements", depth: 0, root: true }];
  const seen = new Set<string>();
  const events = new Map<string, ParsedSourcePayload["events"][number]>();
  const attempts = new Map<string, ParsedSourcePayload["attempts"][number]>();
  const resources = new Map<string, ParsedSourcePayload["resources"][number]>();
  const version = `${VERSION}:${await sha256Hex(stableJson(subjects.slice().sort((a, b) => a.id.localeCompare(b.id))))}`;
  let requests = 0;
  let lastRequest = 0;
  const merge = (payload: ParsedSourcePayload) => {
    for (const resource of payload.resources) resources.set(resource.officialUrl, resource);
    for (const event of payload.events.filter(value => value.attemptKey >= floor)) {
      const key = `${event.levelCode}:${event.attemptKey}:${event.subjectId}`;
      const previous = events.get(key);
      if (previous && previous.eventDate !== event.eventDate) throw new Error(`Official schedules disagree for ${key}; canonical dates preserved for review.`);
      events.set(key, event);
    }
    for (const attempt of payload.attempts.filter(value => value.attemptKey >= floor)) attempts.set(`${attempt.levelCodes[0]}:${attempt.attemptKey}`, attempt);
  };
  const priority = (entry: Entry) => entry.root ? 0 : /important announcement|revised schedule/i.test(entry.title) ? 1 : /\.pdf(?:$|\?)/i.test(entry.url) && !/guidance/i.test(entry.title) ? 2 : 3;
  while (queue.length) {
    queue.sort((a, b) => priority(a) - priority(b));
    const entry = queue.shift()!;
    if (seen.has(entry.url) || skippedUrls.has(entry.url)) continue;
    seen.add(entry.url);
    // A complete primary timetable supersedes the guidance-document fallback.
    // Still recheck primary notices so amendments reach the review pipeline.
    if (/guidance/i.test(entry.title)) {
      const keys = scheduleAttemptKeys(entry.title);
      const levels = detectLevels(entry.title, ["foundation", "intermediate", "final"]);
      if (keys.length && keys.every(key => levels.every(level => [...events.values()].filter(event => event.attemptKey === key && event.levelCode === level).length === (level === "foundation" ? 4 : 6)))) continue;
    }
    await checkpoint(entry.url);
    if (Date.now() > deadline) throw new Error("Schedule discovery reached its time limit; canonical dates preserved.");
    let bytes: Uint8Array; let contentType = "text/html"; let finalUrl = entry.url;
    let response: Response | undefined;
    const cached = await db.prepare("SELECT etag,last_modified,payload,parser_version FROM icai_exam_document_cache WHERE url=?1").bind(entry.url).first<CacheRow>();
    if (entry.url === source.officialUrl) bytes = new TextEncoder().encode(rootHtml);
    else {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Math.min(source.timeoutMs, 15_000));
      try {
        for (let redirects = 0; redirects <= 5; redirects++) {
          if (++requests > MAX_FETCHES) throw new Error("Schedule discovery exceeded its request budget; canonical dates preserved.");
          const url = new URL(finalUrl);
          if (!isApprovedIcaiUrl(finalUrl) || url.protocol !== "https:") throw new Error("Rejected non-HTTPS or non-ICAI schedule URL.");
          const headers = new Headers({ "User-Agent": userAgent, Accept: "text/html,application/pdf" });
          if (cached?.parser_version === version) {
            if (cached.etag) headers.set("If-None-Match", cached.etag);
            if (cached.last_modified) headers.set("If-Modified-Since", cached.last_modified);
          }
          const waitMs = Math.min(source.requestIntervalSeconds, 4) * 1000 - (Date.now() - lastRequest);
          if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
          lastRequest = Date.now();
          response = await fetcher(finalUrl, { redirect: "manual", headers, signal: controller.signal });
          if ([301,302,303,307,308].includes(response.status)) {
            const location = response.headers.get("location"); await response.body?.cancel();
            if (!location || redirects === 5) throw new Error("Invalid ICAI schedule redirect.");
            finalUrl = new URL(location, finalUrl).toString(); continue;
          }
          break;
        }
        if (response?.status === 304 && cached?.parser_version === version) { merge(JSON.parse(cached.payload)); continue; }
        if (!response?.ok) throw new Error(`Official schedule fetch returned ${response?.status}: ${entry.url}`);
        contentType = response.headers.get("content-type") ?? "";
        bytes = await readBounded(response);
      } finally { clearTimeout(timeout); }
    }
    if (/application\/pdf/i.test(contentType) || new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
      const text = await extractSchedulePdf(bytes);
      const parsed = parseExamSchedule(text, finalUrl, subjects);
      if (parsed.events.length) parsed.resources.push({ title: entry.title, officialUrl: finalUrl, summary: null, resourceType: "schedule", levelCodes: [...new Set(parsed.events.map(event => event.levelCode))], attemptKeys: [...new Set(parsed.events.map(event => event.attemptKey))], subjectIds: parsed.events.map(event => event.subjectId!).filter(Boolean), publishedOn: null });
      merge(parsed);
      await db.prepare("INSERT INTO icai_exam_document_cache(url,etag,last_modified,content_hash,parser_version,payload,checked_at) VALUES(?1,?2,?3,?4,?5,?6,CURRENT_TIMESTAMP) ON CONFLICT(url) DO UPDATE SET etag=excluded.etag,last_modified=excluded.last_modified,content_hash=excluded.content_hash,parser_version=excluded.parser_version,payload=excluded.payload,checked_at=excluded.checked_at")
        .bind(entry.url,response?.headers.get("etag")??null,response?.headers.get("last-modified")??null,await sha256Hex(text),version,JSON.stringify(parsed)).run();
      continue;
    }
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error("Unsupported official schedule document type.");
    const html = new TextDecoder().decode(bytes);
    if (entry.depth >= 3) continue;
    for (const link of extractOfficialLinks(html, finalUrl)) {
      if (IGNORE.test(`${link.title} ${link.url.replace(/[_/-]+/g, " ")}`)) continue;
      const keys = scheduleAttemptKeys(link.title);
      const pdf = /\.pdf(?:$|\?)/i.test(link.url);
      const relevant = keys.some(key => key >= floor) && SCHEDULE.test(link.title);
      const childDocument = !entry.root && (pdf || /\b(important announcement|guidance|schedule|timetable)\b/i.test(link.title));
      if (!relevant && !childDocument) continue;
      if (keys.length && !keys.some(key => key >= floor)) continue;
      queue.push({ url: link.url, title: link.title, depth: entry.depth + 1 });
    }
  }
  return { resources: [...resources.values()], attempts: [...attempts.values()], events: [...events.values()] };
}
