import assert from "node:assert/strict";
import {test} from "node:test";
import {destinationFromWebsiteLink} from "../apps/mobile/src/deep-link-destination.ts";

const authorized = (href) => {
  const url = new URL(href);
  if (url.origin !== "https://caprogress.zanisheluxe.in") return null;
  if (url.pathname.startsWith("/chapters/")) return "progress";
  if (url.pathname.startsWith("/subjects/")) return "syllabus";
  if (url.pathname.startsWith("/notes")) return "notes";
  if (url.pathname.startsWith("/resources")) return "resources";
  if (url.pathname === "/tests") return "tests";
  return null;
};

test("website chapter, subject, note and resource links retain native detail context", () => {
  assert.deepEqual(destinationFromWebsiteLink("/chapters/ch-21", authorized),{route:"progress",context:{chapterId:"ch-21"}});
  assert.deepEqual(destinationFromWebsiteLink("/subjects/financial-accounting", authorized),{route:"syllabus",context:{subjectId:"financial-accounting"}});
  assert.deepEqual(destinationFromWebsiteLink("/subjects/financial-accounting/progress", authorized),{route:"progress",context:{subjectId:"financial-accounting"}});
  assert.deepEqual(destinationFromWebsiteLink("/notes/n-8", authorized),{route:"notes",context:{noteLocalId:"n-8"}});
  assert.deepEqual(destinationFromWebsiteLink("/resources/r-2/view", authorized),{route:"resources",context:{resourceLocalId:"r-2"}});
  assert.deepEqual(destinationFromWebsiteLink("/tests", authorized),{route:"tests"});
});

test("untrusted links and malformed context do not navigate", () => {
  assert.equal(destinationFromWebsiteLink("https://example.org/chapters/ch-21", authorized),null);
  assert.equal(destinationFromWebsiteLink("/unknown", authorized),null);
  assert.equal(destinationFromWebsiteLink("/chapters/%E0%A4%A", authorized),null);
  assert.equal(destinationFromWebsiteLink("", authorized),null);
});
