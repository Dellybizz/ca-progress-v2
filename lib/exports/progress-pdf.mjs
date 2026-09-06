const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 42;
const TOP = 748;
const LINE_HEIGHT = 15;
const LINES_PER_PAGE = 44;

function ascii(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function yes(value) {
  return value ? "Yes" : "-";
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const left = [clean(a.levelTitle), clean(a.subjectTitle), clean(a.chapterNumber), clean(a.chapterTitle), clean(a.chapterId)].join("\u0000");
    const right = [clean(b.levelTitle), clean(b.subjectTitle), clean(b.chapterNumber), clean(b.chapterTitle), clean(b.chapterId)].join("\u0000");
    return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
  });
}

function progressLines(input) {
  const rows = sortRows(Array.isArray(input.rows) ? input.rows : []);
  const completed = rows.filter((row) => row.completedAt).length;
  const revision1 = rows.filter((row) => row.revision1At).length;
  const revision2 = rows.filter((row) => row.revision2At).length;
  const test1 = rows.filter((row) => row.test1At).length;
  const test2 = rows.filter((row) => row.test2At).length;
  const profile = input.profile ?? {};
  const identity = [clean(profile.displayName), clean(profile.caLevel), clean(profile.groupChoice), clean(profile.attemptKey)].filter(Boolean).join(" | ");

  const lines = [
    "CA Progress - Progress Report",
    identity || "Account progress",
    "",
    `Tracked chapters: ${rows.length} | Completed: ${completed} | Revision 1: ${revision1} | Revision 2: ${revision2} | Test 1: ${test1} | Test 2: ${test2}`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("No saved chapter progress yet.");
    return lines;
  }

  for (const row of rows) {
    const chapter = [clean(row.chapterNumber) ? `Ch ${clean(row.chapterNumber)}` : "Chapter", clean(row.chapterTitle)].filter(Boolean).join(" ");
    const prefix = [clean(row.subjectTitle), chapter].filter(Boolean).join(" - ");
    const status = `Completed:${yes(row.completedAt)} Rev1:${yes(row.revision1At)} Rev2:${yes(row.revision2At)} Test1:${yes(row.test1At)} Test2:${yes(row.test2At)}`;
    const text = `${prefix || "Chapter"} | ${status}`;
    lines.push(text.length > 112 ? `${text.slice(0, 109)}...` : text);
  }
  return lines;
}

function contentStream(lines, pageNumber, pageCount) {
  const commands = ["BT", "/F1 10 Tf"];
  lines.forEach((line, index) => {
    const y = TOP - index * LINE_HEIGHT;
    commands.push(`1 0 0 1 ${LEFT} ${y} Tm (${ascii(line)}) Tj`);
  });
  commands.push(`1 0 0 1 ${LEFT} 28 Tm (Page ${pageNumber} of ${pageCount}) Tj`, "ET");
  return commands.join("\n");
}

export function buildProgressPdf(input = {}) {
  const allLines = progressLines(input);
  const chunks = [];
  for (let i = 0; i < allLines.length; i += LINES_PER_PAGE) chunks.push(allLines.slice(i, i + LINES_PER_PAGE));
  if (chunks.length === 0) chunks.push([]);

  const objects = new Map();
  const kids = chunks.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Kids [${kids}] /Count ${chunks.length} >>`);
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  chunks.forEach((lines, i) => {
    const pageObj = 4 + i * 2;
    const contentObj = pageObj + 1;
    const stream = contentStream(lines, i + 1, chunks.length);
    objects.set(pageObj, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`);
    objects.set(contentObj, `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  const encoder = new TextEncoder();
  let pdf = "%PDF-1.4\n%CAProgress\n";
  const offsets = [0];
  const maxObject = Math.max(...objects.keys());
  for (let id = 1; id <= maxObject; id += 1) {
    offsets[id] = encoder.encode(pdf).length;
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxObject; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}
