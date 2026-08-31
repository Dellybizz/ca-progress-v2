import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Planner copy is student-facing and free of phase implementation wording", () => {
  const page = read("app/(student)/planner/page.tsx");
  const client = read("components/planner/planner-client.tsx");
  assert.match(page, /Plan your study day\./);
  assert.doesNotMatch(page, /Add what you need to study, revise or test today\./);
  assert.doesNotMatch(page, /Phase 6|Phase 9|smart engine|normalized/i);
  assert.doesNotMatch(client, /Phase 6|Phase 9|normalized|recommendations/i);
});

test("Planner makes today summary, task list and task composer obvious", () => {
  const client = read("components/planner/planner-client.tsx");
  assert.match(client, /Tasks today/);
  assert.match(client, /Planned time/);
  assert.match(client, /Completed/);
  assert.match(client, /Today’s tasks/);
  assert.match(client, /Your day is clear/);
  assert.match(client, /Add task/);
  assert.match(client, /planner-form__grid/);
});

test("Planner uses clear separate date and time scheduling controls", () => {
  const client = read("components/planner/planner-client.tsx");
  assert.match(client, /Scheduled for/);
  assert.match(client, /type="date"/);
  assert.match(client, /type="time"/);
  assert.match(client, /scheduledDate/);
  assert.match(client, /scheduledTime/);
  assert.doesNotMatch(client, /<span>Due<\/span>/);
  assert.doesNotMatch(client, /datetime-local/);
});

test("Planner task deletion uses an in-app confirmation instead of window.confirm", () => {
  const client = read("components/planner/planner-client.tsx");
  const css = read("app/styles/planner-clarity.css");
  assert.match(client, /planner-delete-dialog/);
  assert.match(client, /role="alertdialog"/);
  assert.match(client, /Keep task/);
  assert.match(client, /Delete task/);
  assert.doesNotMatch(client, /window\.confirm\("Delete this task\?"\)/);
  assert.match(css, /planner-dialog-backdrop/);
  assert.match(css, /planner-delete-confirm/);
});

test("Planner clarity styles are loaded", () => {
  const globals = read("app/globals.css");
  const css = read("app/styles/planner-clarity.css");
  assert.match(globals, /planner-clarity\.css/);
  assert.match(css, /planner-layout/);
  assert.match(css, /planner-summary/);
  assert.match(css, /planner-form__grid/);
  assert.match(css, /planner-empty/);
  assert.match(css, /planner-schedule/);
});
