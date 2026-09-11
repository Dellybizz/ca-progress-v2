import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { dashboardExamQuery } from '../lib/dashboard/exam-query.ts';

test('matching approved exam reaches the dashboard after more than 24 unrelated events', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE exam_events (id TEXT, attempt_id TEXT, subject_id TEXT,
      title TEXT, event_type TEXT, event_date TEXT, source_url TEXT,
      last_seen_at TEXT, verification_status TEXT)`);
    const insert = db.prepare('INSERT INTO exam_events VALUES (?,?,?, ?,?,?,NULL,NULL,?)');
    const add = (id, attempt, subject, type, date, status='verified') => insert.run(id,attempt,subject,id,type,date,status);
    for (let i=0;i<30;i++) {
      add(`other-${i}`,'jan','group2','exam_paper','2027-01-01');
      add(`notice-${i}`,'jan',null,'schedule_release','2027-01-01');
    }
    add('selected','jan','group1','exam_paper','2027-01-15');
    add('other-attempt','may','group1','exam_paper','2027-01-02');
    add('unmapped','jan',null,'exam_paper','2027-01-03');
    add('withdrawn','jan','group1','exam_paper','2027-01-04','withdrawn');
    add('pending','jan','group1','exam_paper','2027-01-05','pending_review');
    add('past','jan','group1','exam_paper','2026-12-30');
    const run = (subjects) => {
      const query = dashboardExamQuery('jan',subjects,'2027-01-01');
      return db.prepare(query.sql).all(...query.values).map(row=>row.id);
    };
    assert.deepEqual(run(['group1']),['selected']);
    assert.deepEqual(run([]),[]);
    add('start','jan',null,'exam_start','2027-01-10');
    assert.deepEqual(run(['group1']),['start','selected']);
    assert.deepEqual(run([]),['start']);
    assert.deepEqual(run(["group1') OR 1=1 --"]),['start']);
  } finally { db.close(); }
});

test('the scoped date reaches the dashboard model across IST midnight and disappears after withdrawal', async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const countdown = await import('../lib/dashboard/countdown.ts');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE exam_events (id TEXT,attempt_id TEXT,subject_id TEXT,title TEXT,event_type TEXT,event_date TEXT,source_url TEXT,last_seen_at TEXT,verification_status TEXT)`);
    db.prepare('INSERT INTO exam_events VALUES (?,?,?,?,?,?,?,?,?)').run('paper','jan','subject','Selected paper','exam_paper','2027-01-15','https://www.icai.org/exam.pdf','2026-12-01','verified');
    const academic = { level: { id: 'level', code: 'intermediate', name: 'Intermediate' }, groups: [{ code: 'group_1', name: 'Group 1' }], subjects: [{ id: 'subject', title: 'Paper', slug: 'paper', groupCode: 'group_1', chapterCount: 1, chapterIds: ['chapter'] }], totalChapters: 1 };
    const imports = {
      'server-only': {},
      '@/lib/academic/student-context': { getStudentContext: async () => ({ mode: 'ready', userId: 'student', displayName: 'Student', selection: { level: 'intermediate', group: 'group_1', attemptKey: 'jan' }, timezone: 'Asia/Kolkata', dailyTargetMinutes: 120 }) },
      '@/lib/cloudflare/runtime-env': { measureServerPerformance: async (_name, fn) => fn() },
      '@/lib/planner/dashboard': { getLatestStoredPlanRecommendation: async () => null, getPlannerDashboardSummary: async () => ({ taskCount: 0, revisionTaskCount: 0, testTaskCount: 0, estimatedMinutes: 0 }) },
      '@/lib/progress/service': { getProgressDashboardSummary: async () => ({ groups: [], subjects: [], overallPercent: 0, revision1Count: 0, revision2Count: 0, test1Count: 0, test2Count: 0 }) },
      '@/lib/study/service': { getStudyAnalytics: async () => ({ last7DaysSeconds: 0, todaySeconds: 0, streakDays: 0, sessionCountLast7Days: 0 }) },
      './countdown': countdown,
      './reference': {
        getDashboardAcademicReference: async () => academic,
        getDashboardLiveReference: async ({ subjectIds, today }) => {
          const query = dashboardExamQuery('jan', subjectIds, today);
          const examEvents = db.prepare(query.sql).all(...query.values).map(row => ({ id: row.id, title: row.title, eventDate: row.event_date, eventType: row.event_type, sourceUrl: row.source_url, lastVerifiedAt: row.last_seen_at }));
          return { attempt: { label: 'January', sourceUrl: 'https://www.icai.org/attempt', lastVerifiedAt: '2026-12-01' }, examEvents, updates: [], verifiedAt: null };
        },
      },
    };
    const source = readFileSync(new URL('../lib/dashboard/service.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports);
    const before = await loaded.exports.getDashboardPageModel(new Date('2027-01-14T18:29:59Z'));
    assert.equal(before.countdown.daysRemaining, 1);
    assert.equal(before.countdown.targetDate, '2027-01-15');
    assert.equal(before.countdown.sourceUrl, 'https://www.icai.org/exam.pdf');
    const midnight = await loaded.exports.getDashboardPageModel(new Date('2027-01-14T18:30:00Z'));
    assert.equal(midnight.countdown.daysRemaining, 0);
    db.exec("UPDATE exam_events SET verification_status='withdrawn'");
    const missing = await loaded.exports.getDashboardPageModel(new Date('2027-01-14T18:30:00Z'));
    assert.equal(missing.countdown.status, 'awaiting_verified_date');
    assert.equal(missing.countdown.sourceUrl, null);
    assert.equal(missing.countdown.lastVerifiedAt, null);
  } finally { db.close(); }
});
