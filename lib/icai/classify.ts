import type { IcaiLevelCode, IcaiResourceType } from "./types";

const RESOURCE_PATTERNS: [IcaiResourceType, RegExp][] = [
  ["rtp", /\b(revision test paper|rtp)\b/i],
  ["mtp", /\b(mock test paper|mock test|model test paper|mtp)\b/i],
  ["suggested_answer", /\b(suggested answers?|suggested solution)\b/i],
  ["question_paper", /\b(question papers?|examination paper)\b/i],
  ["statutory_update", /\b(statutory update|statutory updates)\b/i],
  ["amendment", /\b(amendment|amendments|corrigendum|addendum)\b/i],
  ["study_material", /\b(study material|study module|study modules|study text|study booklet)\b/i],
  ["schedule", /\b(date sheet|exam schedule|examination schedule|important dates?|time table|timetable|reschedul|postpon)\b/i],
];

export function classifyResource(title: string, url: string): IcaiResourceType {
  const haystack = `${title} ${url}`;
  return RESOURCE_PATTERNS.find(([, pattern]) => pattern.test(haystack))?.[0] ?? "announcement";
}

export function detectLevels(text: string, defaults: IcaiLevelCode[]): IcaiLevelCode[] {
  const found = new Set<IcaiLevelCode>();
  if (/\bfoundation\b/i.test(text)) found.add("foundation");
  if (/\b(intermediate|inter)\b/i.test(text)) found.add("intermediate");
  if (/\bfinal\b/i.test(text)) found.add("final");
  return found.size ? [...found] : defaults;
}

function monthKey(month: string, year: string) {
  const date = new Date(`${month} 1, ${year} 00:00:00 UTC`);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function detectAttemptKeys(text: string) {
  const keys = new Set<string>();
  const named = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = named.exec(text))) {
    const key = monthKey(match[1], match[2]);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

export function attemptLabel(key: string) {
  const match = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(key);
  if (!match) return key;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function isoFromNamedDate(day: string, month: string, year: string) {
  const date = new Date(`${month} ${day}, ${year} 00:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function isoFromNumericDate(day: string, month: string, year: string) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date.toISOString().slice(0, 10);
}

export function detectPublishedDate(text: string) {
  const numericMatches = [...text.matchAll(/\((\d{1,2})[-/](\d{1,2})[-/](20\d{2})\)/g)];
  const numeric = numericMatches.at(-1);
  if (numeric) return isoFromNumericDate(numeric[1], numeric[2], numeric[3]);

  const namedMatches = [...text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(January|February|March|April|May|June|July|August|September|October|November|December)[,\s-]+(20\d{2})\b/gi)];
  const named = namedMatches.at(-1);
  return named ? isoFromNamedDate(named[1], named[2], named[3]) : null;
}

export function detectExplicitExamDate(text: string) {
  const named = /\b(?:scheduled(?:\s+to\s+be\s+held)?(?:\s+from|\s+on)?|to\s+be\s+held\s+on|examination\s+on)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i.exec(text);
  if (named) return isoFromNamedDate(named[1], named[2], named[3]);

  const numeric = /\b(?:scheduled(?:\s+to\s+be\s+held)?(?:\s+from|\s+on)?|to\s+be\s+held\s+on|examination\s+on)\s+(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/i.exec(text);
  return numeric ? isoFromNumericDate(numeric[1], numeric[2], numeric[3]) : null;
}

export function normalizeComparable(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
