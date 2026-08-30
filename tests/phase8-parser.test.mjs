import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = new URL("../", import.meta.url).pathname;

async function loadStandaloneTs(path) {
  const source = readFileSync(join(root, path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
  return import(url);
}

test("Phase 8 date parser separates publication dates from explicit exam dates", async () => {
  const classify = await loadStandaloneTs("lib/icai/classify.ts");
  assert.equal(classify.detectPublishedDate("ICAI announcement (28-08-2026)"), "2026-08-28");
  assert.equal(classify.detectExplicitExamDate("ICAI announcement published (28-08-2026)"), null);
  assert.equal(classify.detectExplicitExamDate("Foundation Examination scheduled on 15 September 2026"), "2026-09-15");
  assert.equal(classify.detectExplicitExamDate("Examination to be held on 04/11/2026"), "2026-11-04");
});

test("Phase 8 attempt detection derives month/year from official text instead of a hardcoded frequency", async () => {
  const classify = await loadStandaloneTs("lib/icai/classify.ts");
  assert.deepEqual(classify.detectAttemptKeys("Foundation September 2026 and Intermediate January 2027"), ["2026-09", "2027-01"]);
  assert.equal(classify.attemptLabel("2026-11"), "November 2026");
});

test("Phase 8 official-link parser rejects non-ICAI hosts and tracking noise", async () => {
  const html = await loadStandaloneTs("lib/icai/html.ts");
  assert.equal(html.isApprovedIcaiUrl("https://www.icai.org/post/example"), true);
  assert.equal(html.isApprovedIcaiUrl("https://boslive.icai.org/bos_announcement.php"), true);
  assert.equal(html.isApprovedIcaiUrl("https://example.com/?next=https://icai.org"), false);

  const links = html.extractOfficialLinks(`
    <a href="/post/rtp?utm_source=test">Revision Test Paper September 2026</a>
    <a href="https://evil.example/rtp">Fake RTP</a>
    <a href="mailto:test@example.com">Mail us</a>
  `, "https://www.icai.org/category/bos-important-announcements");

  assert.equal(links.length, 1);
  assert.equal(links[0].title, "Revision Test Paper September 2026");
  assert.equal(links[0].url, "https://www.icai.org/post/rtp");
});
