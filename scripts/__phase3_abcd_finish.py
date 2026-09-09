from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)

# 3A: scope live source status to the exact source_ids selected for the run.
path = "lib/icai/status-query.ts"
text = read(path)
text = replace_once(
    text,
    '"id,status,trigger_type,started_at,completed_at,source_total,source_processed,source_succeeded,source_failed,new_items,changed_items,unchanged_items,removed_items,pending_reviews,error_summary";',
    '"id,status,trigger_type,started_at,completed_at,source_total,source_processed,source_succeeded,source_failed,new_items,changed_items,unchanged_items,removed_items,pending_reviews,error_summary,details";',
    "status run details column",
)
text = replace_once(
    text,
    'function jobRunId(job: Record<string, unknown>) {\n  try {\n    const payload = JSON.parse(String(job.payload_json ?? "{}")) as Record<string, unknown>;\n    return asString(payload.runId);\n  } catch { return null; }\n}\n',
    'function jobRunId(job: Record<string, unknown>) {\n  try {\n    const payload = JSON.parse(String(job.payload_json ?? "{}")) as Record<string, unknown>;\n    return asString(payload.runId);\n  } catch { return null; }\n}\n\nfunction selectedRunSourceIds(run: Record<string, unknown>) {\n  try {\n    const details = JSON.parse(String(run.details ?? "{}")) as Record<string, unknown>;\n    return Array.isArray(details.source_ids)\n      ? details.source_ids.filter((value): value is string => typeof value === "string" && value.length > 0)\n      : [];\n  } catch {\n    return [];\n  }\n}\n',
    "selected source parser",
)
text = replace_once(
    text,
    '  const sourceResults = sources.map((source) => {',
    '  const selectedSourceIds = new Set(selectedRunSourceIds(run));\n  const visibleSources = selectedSourceIds.size\n    ? sources.filter((source) => selectedSourceIds.has(String(source.id)))\n    : sources;\n\n  const sourceResults = visibleSources.map((source) => {',
    "scoped source results",
)
text = replace_once(
    text,
    '  const sourceFailure = sources.find((source) => {',
    '  const sourceFailure = visibleSources.find((source) => {',
    "scoped source failure",
)
write(path, text)

# 3B: add immediate source restoration and keep targeted retry semantics truthful.
path = "app/(admin)/admin/icai-sync/actions.ts"
text = read(path)
marker = 'export async function runTargetedIcaiSyncAction(formData: FormData) {'
restore_action = '''export async function restoreIcaiSourceAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const sourceId = String(formData.get("sourceId") ?? "").trim();
    if (!sourceId || sourceId.length > 200) throw new Error("Invalid ICAI source restore request.");
    const admin = createD1AdminClient();
    const source = await admin.from("icai_sources").select("id,excluded_until,exclusion_reason").eq("id", sourceId).maybeSingle();
    if (source.error) throw source.error;
    if (!source.data) throw new Error("ICAI source was not found.");
    if (source.data.excluded_until || source.data.exclusion_reason) {
      const update = await admin.from("icai_sources").update({ excluded_until: null, exclusion_reason: null, updated_at: new Date().toISOString() }).eq("id", sourceId);
      if (update.error) throw update.error;
      await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: "icai.sync.restore_source", targetType: "icai_source", targetId: sourceId, previousValue: { excludedUntil: source.data.excluded_until, reason: source.data.exclusion_reason }, newValue: { excludedUntil: null, reason: null }, traceId: traceId(), reversible: false });
    }
    destination = "/admin/icai-sync?notice=ICAI%20source%20restored.";
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  revalidatePath("/admin/icai-sync"); redirect(destination);
}

'''
if restore_action.strip() not in text:
    text = replace_once(text, marker, restore_action + marker, "restore source action")
write(path, text)

# 3C: simplify the operational dashboard while retaining controls behind disclosure.
path = "components/icai/admin-sync-monitor.tsx"
text = read(path)
text = replace_once(
    text,
    'import { excludeIcaiSourceAction, restoreIcaiItemAction, runIcaiSyncAction, runTargetedIcaiSyncAction } from "@/app/(admin)/admin/icai-sync/actions";',
    'import { excludeIcaiSourceAction, restoreIcaiItemAction, restoreIcaiSourceAction, runIcaiSyncAction, runTargetedIcaiSyncAction } from "@/app/(admin)/admin/icai-sync/actions";',
    "monitor action import",
)
text = replace_once(
    text,
    '  const metrics = dashboard.operationalMetrics;\n  const sourceMetrics = new Map(dashboard.sourceMetrics.map((item) => [item.sourceId, item]));',
    '  const metrics = dashboard.operationalMetrics;\n  const sourceMetrics = new Map(dashboard.sourceMetrics.map((item) => [item.sourceId, item]));\n  const lastSuccessfulRun = dashboard.recentRuns.find((item) => item.status === "success" || item.status === "completed") ?? null;',
    "last success summary",
)
text = replace_once(
    text,
    '<h1>Sync ICAI data</h1>\n          <p>Run the official-source sync and watch its progress. Synced resources and approval work live on a separate, simpler page.</p>',
    '<h1>ICAI sync operations</h1>\n          <p>Monitor official-source synchronization, recover failed sources, and keep content review separate from runtime operations.</p>',
    "operations hero",
)
text = replace_once(
    text,
    '      <section className="icai-admin-summary">\n        <div><span>Operator</span><strong>{role.replaceAll("_", " ")}</strong></div>\n        <div><span>System</span><strong>{active ? "sync active" : run?.status ?? "ready"}</strong></div>\n        <div><span>Sources</span><strong>{dashboard.sources.filter((source) => source.isActive).length} active</strong></div>\n        <div><span>Schedule</span><strong>Daily · 06:00 IST</strong></div>\n      </section>',
    '      <section className="icai-admin-summary">\n        <div><span>Status</span><strong>{active ? "sync active" : run?.status ?? "ready"}</strong></div>\n        <div><span>Last success</span><strong>{lastSuccessfulRun?.completedAt ? time(lastSuccessfulRun.completedAt) : "—"}</strong></div>\n        <div><span>Sources</span><strong>{dashboard.sources.filter((source) => source.isActive).length} active</strong></div>\n        <div><span>Review queue</span><strong>{dashboard.reviews.length} pending</strong></div>\n      </section>',
    "clean admin summary",
)
# Keep role visible without dedicating a summary card.
text = replace_once(
    text,
    '          <div className="icai-source-flags">\n            <Badge tone="info">1. Sync & progress</Badge>',
    '          <div className="icai-source-flags">\n            <Badge tone="neutral">{role.replaceAll("_", " ")}</Badge>\n            <Badge tone="info">1. Sync & progress</Badge>',
    "operator badge",
)
# Remove misleading manual batch retry: Queue retry owns batch-level retries; operator retry restarts the failed source.
retry_batch = '<form action={runTargetedIcaiSyncAction}><input type="hidden" name="mode" value="retry_batch"/><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Retry failed batch</button></form>'
text = text.replace(retry_batch, '')
# Switch exclusion control to explicit restore when currently excluded.
old_exclude = '<form action={excludeIcaiSourceAction}><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Exclude 24h</button></form>'
new_exclude = '{source.excludedUntil ? <form action={restoreIcaiSourceAction}><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Restore source</button></form> : <form action={excludeIcaiSourceAction}><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Exclude 24h</button></form>}'
text = replace_once(text, old_exclude, new_exclude, "restore source control")
# Convert recovery section to progressive disclosure.
recovery_open = '      <section className="icai-section">\n        <div className="icai-section-heading"><div><span className="eyebrow">Recovery controls</span><h2>Sources and files</h2><p className="icai-muted">Targeted runs preserve canonical data and are disabled while another sync owns the lock.</p></div>'
recovery_new = '      <details className="icai-section icai-disclosure">\n        <summary>Source & file recovery</summary>\n        <div className="icai-section-heading"><div><span className="eyebrow">Recovery controls</span><h2>Sources and files</h2><p className="icai-muted">Targeted runs preserve canonical data and are disabled while another sync owns the lock.</p></div>'
text = replace_once(text, recovery_open, recovery_new, "recovery disclosure open")
skip_anchor = '        {dashboard.skippedItems.length ? <div className="icai-result-list">{dashboard.skippedItems.map(item=><article key={item.id}><span><span><strong>{item.itemUrl}</strong><small>{item.scope}{item.skippedUntil ? ` · until ${time(item.skippedUntil)}` : ""}</small></span></span><form action={restoreIcaiItemAction}><input type="hidden" name="skipId" value={item.id}/><button className="ui-button ui-button--sm">Restore file</button></form></article>)}</div> : null}\n      </section>'
text = replace_once(text, skip_anchor, skip_anchor.replace('</section>', '</details>'), "recovery disclosure close")
# Remove redundant standalone schedule panel; schedule remains in live status.
schedule_start = text.find('      <section className="icai-section">\n        <div className="icai-section-heading">\n          <div><span className="eyebrow">Upcoming schedule</span>')
history_start = text.find('      <section className="icai-section">\n        <div className="icai-section-heading">\n          <div><span className="eyebrow">Recent runs</span>', schedule_start)
if schedule_start < 0 or history_start < 0:
    raise SystemExit("missing patch anchor: schedule/history sections")
text = text[:schedule_start] + text[history_start:]
# Fold history into disclosure.
history_open = '      <section className="icai-section">\n        <div className="icai-section-heading">\n          <div><span className="eyebrow">Recent runs</span><h2>Execution history</h2></div>'
history_new = '      <details className="icai-section icai-disclosure">\n        <summary>Recent run history</summary>\n        <div className="icai-section-heading">\n          <div><span className="eyebrow">Recent runs</span><h2>Execution history</h2></div>'
text = replace_once(text, history_open, history_new, "history disclosure open")
# The final section close before component wrappers is the history section.
needle = '        </div>\n      </section>\n    </div>\n  );\n}'
text = replace_once(text, needle, '        </div>\n      </details>\n    </div>\n  );\n}', "history disclosure close")
write(path, text)

# 3D: expose the catalog's existing type filter on the review/data page.
path = "app/(admin)/admin/icai-sync/data/page.tsx"
text = read(path)
text = replace_once(
    text,
    '    subject: param(params.subject),\n  };',
    '    subject: param(params.subject),\n    type: param(params.type),\n  };',
    "data page type filter",
)
write(path, text)

path = "components/icai/admin-sync-data.tsx"
text = read(path)
text = replace_once(
    text,
    'import type { IcaiAdminDashboard, IcaiPublicCatalog } from "@/lib/icai/types";',
    'import { ICAI_RESOURCE_TYPES, type IcaiAdminDashboard, type IcaiPublicCatalog } from "@/lib/icai/types";',
    "resource type import",
)
old_filters = '<label>Subject<select name="subject" defaultValue={catalog.filters.subject}><option value="">All subjects</option>{catalog.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>\n          <button className="ui-button ui-button--primary" type="submit">Apply filters</button>'
new_filters = '<label>Subject<select name="subject" defaultValue={catalog.filters.subject}><option value="">All subjects</option>{catalog.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>\n          <label>Resource type<select name="type" defaultValue={catalog.filters.type}><option value="">All resource types</option>{ICAI_RESOURCE_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>\n          <button className="ui-button ui-button--primary" type="submit">Apply filters</button>'
text = replace_once(text, old_filters, new_filters, "resource type filter control")
write(path, text)

# Permanent 3A-3D regression contract.
test_path = ROOT / "tests/icai-phase3-admin.test.mjs"
test_path.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 3A live status is capability protected, no-store and scoped to the run's selected sources", () => {
  const route = read("app/api/admin/icai-sync/status/route.ts");
  const query = read("lib/icai/status-query.ts");
  const live = read("components/icai/sync-live-refresh.tsx");
  assert.match(route, /requireAdminCapability\("icai\.read"\)/);
  assert.match(route, /private, no-store/);
  assert.match(query, /error_summary,details/);
  assert.match(query, /selectedRunSourceIds/);
  assert.match(query, /details\.source_ids/);
  assert.match(query, /visibleSources = selectedSourceIds\.size/);
  assert.match(query, /ICAI_STALL_THRESHOLD_MS/);
  assert.match(query, /nextRetryAt/);
  assert.match(query, /nextDailySync/);
  assert.match(live, /Overall progress/);
  assert.match(live, /Heartbeat/);
  assert.match(live, /runtime\.currentSourceName/);
  assert.match(live, /runtime\.batchNumber/);
  assert.match(live, /runtime\.processedItems/);
  assert.match(live, /Next retry/);
});

test("Phase 3B operator controls are capability checked, audited, recoverable and use Queue jobs for sync execution", () => {
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(actions, /requireAdminCapability\("icai\.run"\)/);
  assert.match(actions, /recordAdminAuditEvent/);
  assert.match(actions, /jobKey\("icai-sync", "targeted"/);
  assert.match(actions, /intent === "pause"/);
  assert.match(actions, /intent === "resume"/);
  assert.match(actions, /intent === "cancel"/);
  assert.match(actions, /intent === "recover"/);
  assert.match(actions, /skipIcaiItemAction/);
  assert.match(actions, /restoreIcaiItemAction/);
  assert.match(actions, /excludeIcaiSourceAction/);
  assert.match(actions, /restoreIcaiSourceAction/);
  assert.match(actions, /excluded_until: null, exclusion_reason: null/);
  assert.match(actions, /icai\.sync\.restore_source/);
  assert.match(monitor, /Run source/);
  assert.match(monitor, /Force recheck/);
  assert.match(monitor, /Retry failed source/);
  assert.match(monitor, /Exclude 24h/);
  assert.match(monitor, /Restore source/);
  assert.doesNotMatch(monitor, />Retry failed batch</);
});

test("Phase 3C keeps the main ICAI admin page operational and progressively discloses secondary controls", () => {
  const page = read("app/(admin)/admin/icai-sync/page.tsx");
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(page, /requireAdminPageCapability\("icai\.read"\)/);
  assert.match(monitor, /ICAI sync operations/);
  assert.match(monitor, /SyncLiveRefresh/);
  assert.match(monitor, /href="\/admin\/icai-sync\/data"/);
  assert.match(monitor, /<summary>Source & file recovery<\/summary>/);
  assert.match(monitor, /<summary>Recent run history<\/summary>/);
  assert.match(monitor, /Review queue/);
  assert.doesNotMatch(monitor, /decideIcaiReviewAction/);
  assert.doesNotMatch(monitor, />Approve</);
  assert.doesNotMatch(monitor, />Reject</);
  assert.doesNotMatch(monitor, /Upcoming schedule/);
});

test("Phase 3D separates verified student-facing content and review work with complete filters and official evidence", () => {
  const page = read("app/(admin)/admin/icai-sync/data/page.tsx");
  const data = read("components/icai/admin-sync-data.tsx");
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  assert.match(page, /requireAdminPageCapability\("icai\.read"\)/);
  assert.match(page, /type: param\(params\.type\)/);
  assert.match(data, /ICAI_RESOURCE_TYPES/);
  assert.match(data, /name="level"/);
  assert.match(data, /name="attempt"/);
  assert.match(data, /name="subject"/);
  assert.match(data, /name="type"/);
  assert.match(data, /Approval queue/);
  assert.match(data, />Approve</);
  assert.match(data, />Reject</);
  assert.match(data, /Open ICAI PDF|Open PDF/);
  assert.match(data, /Exam dates and countdown sources/);
  assert.match(data, /Possible duplicate groups/);
  assert.match(data, /Official source evidence and availability/);
  assert.doesNotMatch(data, /runTargetedIcaiSyncAction/);
  assert.doesNotMatch(data, /controlIcaiSyncAction/);
  assert.match(actions, /requireAdminCapability\("icai\.review"\)/);
  assert.match(actions, /invalidateSharedPublicCache\(\["icai"\]\)/);
});
''')

# Keep Phase 3 regression in every existing authoritative ICAI gate.
path = "package.json"
pkg = json.loads(read(path))
script = pkg["scripts"]["test:icai:phase5"]
if "tests/icai-phase3-admin.test.mjs" not in script:
    script += " tests/icai-phase3-admin.test.mjs"
pkg["scripts"]["test:icai:phase5"] = script
write(path, json.dumps(pkg, indent=2) + "\n")

# Remove temporary verifier machinery from the final tree before tests/commit.
(ROOT / "scripts/__phase3_abcd_finish.py").unlink(missing_ok=True)
(ROOT / ".github/workflows/__phase3-abcd-verify.yml").unlink(missing_ok=True)
