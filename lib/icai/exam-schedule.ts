import type { IcaiLevelCode, ParsedExamEvent, ParsedSourcePayload } from "./types";

export type ExamSubject = { id: string; title: string; levelCode: IcaiLevelCode; paperLabel?: string };
const MONTHS = "January February March April May June July August September October November December".split(" ");
const MONTH = `(?:${MONTHS.join("|")})`;
const DAY = String.raw`\d{1,2}(?:st|nd|rd|th)?`;
const DATE_LIST = new RegExp(`((?:${DAY}\\s*(?:,\\s*(?:&|and)?|&|and)\\s*)*${DAY})\\s+(${MONTH})\\s*,?\\s*(20\\d{2})`, "gi");
const countFor = (level: IcaiLevelCode) => level === "foundation" ? 4 : 6;
const compact = (text: string) => text.toLowerCase().replace(/[^a-z]/g, "");
function dateKey(day: number, month: number, year: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

// Titles may share the year: "September & November 2026". These are discovery
// hints only; paper dates and level/attempt mappings must come from the document.
export function scheduleAttemptKeys(title: string): string[] {
  const keys = new Set<string>();
  const pattern = new RegExp(`((?:${MONTH}\\s*(?:,|&|and|/)\\s*)*${MONTH})\\s*,?\\s*(20\\d{2})`, "gi");
  for (const match of title.matchAll(pattern)) {
    for (const month of match[1].match(new RegExp(MONTH, "gi")) ?? []) {
      keys.add(`${match[2]}-${String(MONTHS.findIndex(value => value.toLowerCase() === month.toLowerCase()) + 1).padStart(2, "0")}`);
    }
  }
  return [...keys].sort();
}

export function parseExamSchedule(text: string, sourceUrl: string, subjects: ExamSubject[]): ParsedSourcePayload {
  const normalized = text.replace(/[\u00a0\u2010-\u2015]/g, " ").replace(/\s+/g, " ");
  const dates = new Map<string, { level: IcaiLevelCode; paper: number; date: string }>();
  const add = (level: IcaiLevelCode, paper: number, date: string | null) => {
    if (!date) throw new Error("Invalid date in official examination timetable.");
    const key = `${level}:${paper}`;
    const previous = dates.get(key);
    if (previous && previous.date !== date) throw new Error("Conflicting paper dates inside official timetable.");
    dates.set(key, { level, paper, date });
  };
  // Only explicit course-examination headings, never class/MTP/form dates.
  const sections = [...normalized.matchAll(/\b(FOUNDATION|INTERMEDIATE|FINAL)\s+(?:COURSE\s+)?EXAMINATION\b\s*:?/gi)];
  for (let i = 0; i < sections.length; i++) {
    const heading = sections[i];
    const level = heading[1].toLowerCase() as IcaiLevelCode;
    const section = normalized.slice(heading.index! + heading[0].length, sections[i + 1]?.index ?? normalized.length).slice(0, 700);
    const groups = level === "foundation" ? [{ offset: 0, text: section }] : [...section.matchAll(/Group\s*[-:]?\s*(II|I|2|1)\s*:\s*(.*?)(?=Group\s*[-:]?\s*(?:II|I|2|1)\s*:|$)/gi)].map(match => ({ offset: /^(II|2)$/i.test(match[1]) ? 3 : 0, text: match[2] }));
    for (const group of groups) {
      const lists = [...group.text.matchAll(DATE_LIST)];
      const list = lists[0];
      if (!list) continue;
      const days = [...list[1].matchAll(/\d{1,2}/g)].map(match => Number(match[0]));
      const expected = level === "foundation" ? 4 : 3;
      if (days.length !== expected) continue;
      const month = MONTHS.findIndex(value => value.toLowerCase() === list[2].toLowerCase()) + 1;
      days.forEach((day, index) => add(level, group.offset + index + 1, dateKey(day, month, Number(list[3]))));
    }
  }
  // Guidance PDFs use a numeric paper/subject/date table instead of grouped lists.
  const headingLevels = [...normalized.slice(0, 700).matchAll(/\b(FOUNDATION|INTERMEDIATE|FINAL)\s+(?:COURSE\s+)?EXAMINATION\b/gi)];
  const levels = [...new Set(headingLevels.map(match => match[1].toLowerCase() as IcaiLevelCode))];
  const tableStart = normalized.search(/Dates\s+and\s+Timings\s+of\s+the\s+Examination\s*:/i);
  if (levels.length === 1 && tableStart >= 0) {
    const level = levels[0];
    const table = normalized.slice(tableStart, tableStart + 3500);
    for (const subject of subjects.filter(value => value.levelCode === level)) {
      const paper = Number(/\b(?:paper\s*[-:]?\s*)?(\d+)\b/i.exec(subject.paperLabel ?? "")?.[1]);
      if (!paper || paper > countFor(level)) continue;
      const pattern = new RegExp(`\\b${paper}\\s+([A-Za-z][\\s\\S]{0,200}?)\\s+(\\d{1,2})[./-](\\d{1,2})[./-](20\\d{2})\\b`, "g");
      for (const match of table.matchAll(pattern)) {
        const prefix = compact(subject.title).slice(0, 15);
        if (!prefix || !compact(table.slice(Math.max(0, match.index! - 120), match.index! + match[0].length)).includes(prefix)) continue;
        add(level, paper, dateKey(Number(match[2]), Number(match[3]), Number(match[4])));
      }
    }
  }
  const events: ParsedExamEvent[] = [];
  for (const level of ["foundation", "intermediate", "final"] as const) {
    const papers = [...dates.values()].filter(value => value.level === level).sort((a, b) => a.paper - b.paper);
    if (!papers.length) continue;
    if (papers.length !== countFor(level)) throw new Error(`Incomplete ${level} timetable; canonical dates preserved.`);
    const attempts = new Set(papers.map(value => value.date.slice(0, 7)));
    if (attempts.size !== 1 || papers.some((paper, i) => i > 0 && paper.date <= papers[i - 1].date)) throw new Error(`Ambiguous ${level} timetable; canonical dates preserved.`);
    for (const paper of papers) {
      const matches = subjects.filter(value => value.levelCode === level && Number(/\b(?:paper\s*[-:]?\s*)?(\d+)\b/i.exec(value.paperLabel ?? "")?.[1]) === paper.paper);
      if (matches.length !== 1) throw new Error(`Cannot uniquely map ${level} paper ${paper.paper} to the academic catalogue.`);
      const subject = matches[0];
      events.push({ attemptKey: paper.date.slice(0, 7), levelCode: level, eventType: "exam_paper", title: `${subject.paperLabel}: ${subject.title}`, eventDate: paper.date, startTime: null, endTime: null, subjectId: subject.id, sourceUrl, confidence: 0.98 });
    }
  }
  if (sections.length && !events.length) throw new Error("Unsupported official timetable layout; canonical dates preserved for review.");
  const attempts = [...new Set(events.map(event => `${event.levelCode}:${event.attemptKey}`))].map(key => {
    const [level, attemptKey] = key.split(":");
    const date = new Date(`${attemptKey}-01T00:00:00Z`);
    // Paper events own the dates; never infer an attempt start date from a month.
    return { attemptKey, label: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(date), levelCodes: [level as IcaiLevelCode], startDate: null, endDate: null, confidence: 0.98 };
  });
  return { resources: [], attempts, events };
}
