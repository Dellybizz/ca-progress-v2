import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runner = await readFile(new URL('../scripts/phase5/mutation-matrix.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/phase3-mutation-matrix.yml', import.meta.url), 'utf8').catch(()=>'');
const hotScreens = await readFile(new URL('../lib/data/d1/hot-screens.ts', import.meta.url), 'utf8');
const uploadIntentRoute = await readFile(new URL('../app/api/resources/upload-url/route.ts', import.meta.url), 'utf8');
const resourceAccessRoute = await readFile(new URL('../app/api/resources/[id]/access/route.ts', import.meta.url), 'utf8');
const legacyUploadRoute = await readFile(new URL('../app/api/resources/upload/route.ts', import.meta.url), 'utf8');
const uploadCompleteRoute = await readFile(new URL('../app/api/resources/upload-complete/route.ts', import.meta.url), 'utf8');
const baseD1Schema = await readFile(new URL('../d1/migrations/0001_phase2_platform.sql', import.meta.url), 'utf8');

test('Phase 3 covers the required product mutation families', () => {
  for (const fragment of [
    '/api/community/channels/', '/api/community/messages/', '/api/admin/community/moderation',
    '/api/notes', '/api/resources/upload-url', '/api/resources/upload-complete', '/api/admin/resources/moderation', '/access',
    '/api/planner/tasks', '/api/planner/goals', '/api/planner/calendar', '/api/progress',
  ]) assert.match(runner, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(runner, /community message edit capability','unsupported'/);
});

test('Phase 3 uses exact cleanup and preserves progress history', () => {
  assert.match(runner, /ExactCleanupRegistry/);
  assert.match(runner, /buildProgressRestoreSql/);
  assert.match(runner, /progress_events intentionally retained/);
  assert.doesNotMatch(runner, /DELETE FROM progress_events/i);
  assert.doesNotMatch(runner, /LIKE\s+[^\n]*marker/i);
  assert.doesNotMatch(runner, /DELETE FROM tasks WHERE user_id=/i);
  assert.doesNotMatch(runner, /DELETE FROM notes WHERE user_id=/i);
});

test('Phase 3 proves rejected requests do not mutate D1', () => {
  for (const name of [
    'community guest create rejected without D1 mutation',
    'community student moderation rejected without D1 mutation',
    'planner invalid academic scope rejected without D1 mutation',
    'progress invalid chapter rejected without D1 mutation',
    'note ownership protection', 'resource ownership protection', 'planner task ownership protection',
  ]) assert.ok(runner.includes(name), `missing ${name}`);
});

test('Phase 3 uses the signed R2 upload handshake and physical product delete', () => {
  assert.match(runner, /resource signed upload intent/);
  assert.match(runner, /fetch\(uploadUrl,\{method:'PUT'/);
  assert.match(runner, /resource upload complete/);
  assert.match(runner, /resource delete D1 evidence/);
  assert.match(runner, /wrangler','r2','object','delete'/);
});

test('Progress revision rebuild follows the revision_due_items unique key', () => {
  assert.match(baseD1Schema, /UNIQUE\(user_id, chapter_id, revision_number\)/);
  assert.match(hotScreens, /revision_number=\?3 LIMIT 1/);
  assert.doesNotMatch(hotScreens, /revision_number=\?3 AND source_completed_at=\?4/);
  assert.match(hotScreens, /UPDATE revision_due_items SET source_completed_at=\?1/);
  assert.match(hotScreens, /sourceChanged=Boolean\(existing&&existing\.source_completed_at!==row\.completed_at\)/);
});

test('Committed progress is not reported as failed when derived schedule rebuild fails', () => {
  assert.match(hotScreens, /async function rebuildHotRevisionScheduleAfterCommit/);
  assert.match(hotScreens, /progress_revision_schedule_rebuild_failed/);
  assert.match(hotScreens, /await rebuildHotRevisionScheduleAfterCommit\(userId,db\);/);
  assert.doesNotMatch(hotScreens, /console\.error\([^\n]*\.message/);
});

test('Resource upload intent fails closed with a structured outer error', () => {
  assert.match(uploadIntentRoute, /async function createUploadIntent\(request: Request\)/);
  assert.match(uploadIntentRoute, /resource_upload_intent_unhandled/);
  assert.match(uploadIntentRoute, /UPLOAD_SERVICE_UNAVAILABLE/);
  assert.match(uploadIntentRoute, /caught instanceof Error \? caught\.name : "UnknownError"/);
  assert.doesNotMatch(uploadIntentRoute, /caught instanceof Error \? caught\.message/);
});

test('R2 resource routes use the supported OpenNext Node.js runtime', () => {
  for (const [name, source] of [
    ['upload intent', uploadIntentRoute],
    ['signed access', resourceAccessRoute],
    ['legacy upload redirect', legacyUploadRoute],
    ['upload completion', uploadCompleteRoute],
  ]) {
    assert.match(source, /export const runtime = "nodejs"/, `${name} must use Node.js runtime`);
    assert.doesNotMatch(source, /export const runtime = "edge"/, `${name} must not force Edge runtime`);
  }
});

test('Phase 3 workflow is strict and uploads evidence even on failure', () => {
  assert.ok(workflow.length > 0, 'workflow missing');
  for (const env of ['SMOKE_MUTATION_AUTH_COOKIE','SMOKE_MODERATOR_AUTH_COOKIE','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','PHASE3_D1_DATABASE']) assert.ok(workflow.includes(env));
  for (const trigger of ['app/api/progress/**','app/api/resources/**','lib/data/d1/**','lib/resources/**','lib/billing/**']) assert.ok(workflow.includes(trigger), `missing workflow trigger ${trigger}`);
  assert.match(workflow, /node --test tests\/phase3-mutation-matrix\.test\.mjs/);
  assert.match(workflow, /node scripts\/phase5\/mutation-matrix\.mjs/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /if-no-files-found: error/);
});
