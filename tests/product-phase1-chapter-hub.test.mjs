import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 1 Chapter Hub reaches every connected academic workspace", () => {
  const hub = read("components/chapter-hub/chapter-hub.tsx");

  assert.match(hub, /Study history/);
  assert.match(hub, /\/subjects\/\$\{academic\.subjectSlug\}\/progress\?chapterId=/);
  assert.match(hub, /\/study\?\$\{chapterQuery\}/);
  assert.match(hub, /\/tests\?\$\{chapterQuery\}/);
  assert.match(hub, /\/notes\?\$\{chapterQuery\}/);
  assert.match(hub, /\/resources\?\$\{chapterQuery\}/);
  assert.match(hub, /\/community\/\$\{channel\.channelKey\}\?chapterId=/);
  assert.match(hub, /Last studied:/);
  assert.match(hub, /Self-rated understanding will appear here once a study-session reflection has been recorded/);
});

test("Product Phase 1 destinations consume and validate Chapter Hub academic context", () => {
  const studyRoute = read("app/(student)/study/page.tsx");
  const studyPage = read("components/study/study-page.tsx");
  const studyTimer = read("components/study/study-timer.tsx");
  const progressRoute = read("app/(student)/subjects/[subjectSlug]/progress/page.tsx");
  const progressPage = read("components/progress/progress-page.tsx");
  const progressTracker = read("components/progress/progress-tracker.tsx");
  const notesRoute = read("app/(student)/notes/page.tsx");
  const resourcesRoute = read("app/(student)/resources/page.tsx");
  const library = read("components/resources/resource-library.tsx");
  const noteEditor = read("components/resources/note-editor.tsx");

  assert.match(studyRoute, /initialSubjectId=\{cleanId\(params\.subjectId\)\}/);
  assert.match(studyRoute, /initialChapterId=\{cleanId\(params\.chapterId\)\}/);
  assert.match(studyPage, /initialSubjectId=\{initialSubjectId \?\? undefined\}/);
  assert.match(studyPage, /initialChapterId=\{initialChapterId \?\? undefined\}/);
  assert.match(studyTimer, /model\.subjects\.find\(\(subject\) => subject\.id === initialSubjectId\)/);
  assert.match(studyTimer, /initialSubject\.chapters\.some\(\(chapter\) => chapter\.id === initialChapterId\)/);

  assert.match(progressRoute, /searchParams: Promise<\{ chapterId\?: string \}>/);
  assert.match(progressRoute, /initialChapterId=\{chapterId\}/);
  assert.match(progressPage, /initialChapterId=\{initialChapterId\}/);
  assert.match(progressTracker, /model\.chapters\.find\(\(chapter\) => chapter\.id === initialChapterId\)/);

  for (const route of [notesRoute, resourcesRoute]) {
    assert.match(route, /subjectId\?: string; chapterId\?: string/);
    assert.match(route, /initialAcademicContext=\{\{ subjectId, chapterId \}\}/);
  }
  assert.match(library, /function resolveAcademicContext/);
  assert.match(library, /model\.subjects\.find\(\(item\) => item\.id === context\.subjectId\)/);
  assert.match(library, /subject\.chapters\.some\(\(chapter\) => chapter\.id === context\.chapterId\)/);
  assert.match(library, /initialSubjectId=\{academicFilter\.subjectId \|\| undefined\}/);
  assert.match(library, /initialChapterId=\{academicFilter\.chapterId \|\| undefined\}/);
  assert.match(noteEditor, /safeInitialSubject/);
  assert.match(noteEditor, /safeInitialChapterId/);
});

test("Product Phase 1 Chapter Hub private data is cross-user scoped and academic lookup is cross-level scoped", () => {
  const service = read("lib/chapter-hub/service.ts");

  assert.match(service, /WHERE c\.id = \?/);
  assert.match(service, /l\.code = \?/);
  assert.match(service, /s\.group_code = \?/);
  assert.match(service, /a\.attempt_key = \?/);
  assert.match(service, /a\.level_id = s\.level_id/);
  assert.match(service, /aasv\.syllabus_version_id = s\.syllabus_version_id/);

  assert.match(service, /FROM progress\s+WHERE user_id = \? AND chapter_id = \?/s);
  assert.match(service, /FROM progress_events\s+WHERE user_id = \? AND chapter_id = \?/s);
  assert.match(service, /FROM study_sessions\s+WHERE user_id = \? AND chapter_id = \?/s);
  assert.match(service, /rn\.owner_user_id = \? AND rn\.chapter_id = \?/);
  assert.match(service, /ru\.owner_user_id = \? AND ru\.chapter_id = \?/);
});

test("Product Phase 1 existing records stay linked by canonical academic IDs across metadata refreshes", () => {
  const service = read("lib/chapter-hub/service.ts");
  const hub = read("components/chapter-hub/chapter-hub.tsx");

  assert.match(service, /c\.id AS chapter_id/);
  assert.match(service, /s\.id AS subject_id/);
  assert.match(service, /WHERE c\.id = \?/);
  assert.match(service, /chapter_id = \?/);
  assert.match(service, /unit\.chapter_id = \?/);
  assert.match(hub, /data-canonical-chapter-id=\{academic\.chapterId\}/);
  assert.match(hub, /Stable chapter identity/);

  const privateLinkage = service.match(/FROM (?:progress|progress_events|study_sessions|resource_notes rn|resource_uploads ru)[\s\S]{0,240}/g)?.join("\n") ?? "";
  assert.doesNotMatch(privateLinkage, /chapter_name\s*=|chapter_title\s*=/);
});

test("Product Phase 1 keeps one stable Chapter Hub resource card when an official file URL moves", () => {
  const hub = read("components/chapter-hub/chapter-hub.tsx");
  const route = read("app/(student)/resources/[id]/open/route.ts");

  assert.match(hub, /key=\{resource\.canonicalResourceId\}/);
  assert.match(hub, /data-canonical-resource-id=\{resource\.canonicalResourceId\}/);
  assert.match(hub, /\/resources\/\$\{encodeURIComponent\(resource\.canonicalResourceId\)\}\/open/);
  assert.doesNotMatch(hub, /href=\{resource\.(?:directFileUrl|officialUrl|sourcePageUrl)\}/);

  assert.match(route, /autofetch_resource_records/);
  assert.match(route, /a\.canonical_resource_id=\?1 OR r\.id=\?1/);
  assert.match(route, /a\.is_current=1/);
  assert.match(route, /r\.verification_status='verified'/);
  assert.match(route, /row\.direct_file_url \|\| row\.official_url/);
  assert.match(route, /status: 307/);
});
