import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SyncLiveRefresh } from "./sync-live-refresh";
import type { AppRole } from "@/lib/authorization/roles";
import type { IcaiAdminDashboard } from "@/lib/icai/types";
import { excludeIcaiDiagnosticItemAction, excludeIcaiSourceAction, restoreIcaiItemAction, restoreIcaiSourceAction, retryIcaiItemsAction, runIcaiSyncAction, runTargetedIcaiSyncAction } from "@/app/(admin)/admin/icai-sync/actions";
import { CopyFailureButton } from "./copy-failure-button";

function time(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function duration(start: string, end: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function averageLatency(start: string | null, end: string | null, pages: number) {
  if (!start || !end || pages < 1) return "—";
  const milliseconds = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  const average = milliseconds / pages;
  return average < 1_000 ? `${Math.round(average)}ms` : `${(average / 1_000).toFixed(1)}s`;
}

function tone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["success", "completed", "succeeded", "fetched"].includes(status)) return "success";
  if (["failed", "dead_letter"].includes(status)) return "danger";
  if (["running", "queued", "pending"].includes(status)) return "info";
  return status === "partial" ? "warning" : "neutral";
}

const liveLabels = {
  live: "Live worker state",
  skip: "Skip current source",
  cancel: "Cancel run",
  recover: "Recover stalled run",
};

export function IcaiAdminSyncMonitor({
  dashboard,
  role,
  notice,
  error,
}: {
  dashboard: IcaiAdminDashboard;
  role: AppRole;
  notice?: string | null;
  error?: string | null;
}) {
  const run = dashboard.latestRun;
  const active = Boolean(dashboard.activeJob || run?.status === "running");
  const metrics = dashboard.operationalMetrics;
  const sourceMetrics = new Map(dashboard.sourceMetrics.map((item) => [item.sourceId, item]));
  const lastSuccessfulRun = dashboard.recentRuns.find((item) => item.status === "success" || item.status === "completed") ?? null;

  return (
    <div className="icai-page icai-admin-page">
      <section className="icai-hero">
        <div>
          <Badge tone="warning">Admin · ICAI Sync</Badge>
          <h1>ICAI sync operations</h1>
          <p>Monitor official-source synchronization, recover failed sources, and keep content review separate from runtime operations.</p>
          <div className="icai-source-flags">
            <Badge tone="neutral">{role.replaceAll("_", " ")}</Badge>
            <Badge tone="info">1. Sync & progress</Badge>
            <Link className="ui-button ui-button--secondary ui-button--sm" href="/admin/icai-sync/data">2. Synced data & review</Link>
          </div>
        </div>
        <form action={runIcaiSyncAction}>
          <button type="submit" disabled={active} className="ui-button ui-button--primary ui-button--lg">
            {active ? "Sync in progress" : "Run Sync now"}
          </button>
        </form>
      </section>

      {notice ? <div className="auth-status auth-status--success" role="status">{notice}</div> : null}
      {error ? <div className="auth-status auth-status--danger" role="alert">{error}</div> : null}

      <section className="icai-admin-summary">
        <div><span>Status</span><strong>{active ? "sync active" : run?.status ?? "ready"}</strong></div>
        <div><span>Last success</span><strong>{lastSuccessfulRun?.completedAt ? time(lastSuccessfulRun.completedAt) : "—"}</strong></div>
        <div><span>Sources</span><strong>{dashboard.sources.filter((source) => source.isActive).length} active</strong></div>
        <div><span>Review queue</span><strong>{dashboard.reviews.length} pending</strong></div>
      </section>

      <SyncLiveRefresh
        active={active}
        runId={run?.status === "running" && !dashboard.activeJob ? run.id : null}
        labels={liveLabels}
      />

      {!active && run ? (
        <section className="icai-section">
          <div className="icai-section-heading">
            <div>
              <span className="eyebrow">Latest completed run</span>
              <h2>Sync result</h2>
              <p className="icai-muted">Started {time(run.startedAt)} · {run.completedAt ? `finished ${time(run.completedAt)} in ${duration(run.startedAt, run.completedAt)}` : `last observed after ${duration(run.startedAt, null)}`}</p>
            </div>
            <Badge tone={tone(run.status)}>{run.status}</Badge>
          </div>

          <div className="icai-run-stats icai-run-stats--compact">
            <div><span>Sources</span><strong>{run.sourceProcessed}/{run.sourceTotal}</strong></div>
            <div><span>Pages checked</span><strong>{metrics.pagesChecked}</strong></div>
            <div><span>PDFs resolved</span><strong>{metrics.pdfsResolved}</strong></div>
            <div><span>New</span><strong>{run.newItems}</strong></div>
            <div><span>Changed</span><strong>{run.changedItems}</strong></div>
            <div><span>Unchanged</span><strong>{run.unchangedItems}</strong></div>
          </div>

          <details className="icai-disclosure">
            <summary>Performance and write details</summary>
            <div className="icai-run-stats">
              <div><span>Unavailable pages</span><strong>{metrics.unavailablePages}</strong></div>
              <div><span>Skipped pages</span><strong>{metrics.skippedPages}</strong></div>
              <div><span>Affected rows</span><strong>{metrics.affectedRows}</strong></div>
              <div><span>Reviews created</span><strong>{metrics.reviewsCreated}</strong></div>
              <div><span>Reviews suppressed</span><strong>{metrics.reviewsSuppressed}</strong></div>
              <div><span>Total duration</span><strong>{duration(run.startedAt, run.completedAt)}</strong></div>
            </div>
            <p className="icai-muted">D1 request counts are not shown because they are not currently persisted; affected rows is the reliable stored database metric.</p>
          </details>

          <div className="icai-result-list">
            {dashboard.sourceResults.map((result) => {
              const sourceMetric = sourceMetrics.get(result.sourceId);
              return <article key={result.sourceId}>
                <span>
                  <i className={`is-${result.state}`} />
                  <span>
                    <strong>{result.sourceName}</strong>
                    <small>{result.error ?? (result.fetchedAt ? `Fetched ${time(result.fetchedAt)}` : "Not fetched in this run")}</small>
                    {sourceMetric ? <small>{sourceMetric.pagesChecked} checked · {sourceMetric.pdfsResolved} PDFs · {sourceMetric.unavailablePages + sourceMetric.skippedPages} unavailable/skipped</small> : null}
                  </span>
                </span>
                <span>
                  <Badge tone={tone(result.state)}>{result.state.replaceAll("_", " ")}</Badge>
                  <small>{sourceMetric?.startedAt ? `${duration(sourceMetric.startedAt, sourceMetric.finishedAt)} · avg ${averageLatency(sourceMetric.startedAt, sourceMetric.finishedAt, sourceMetric.pagesChecked)}/page` : result.parsedItemCount === null ? "—" : `${result.parsedItemCount} eligible items`}</small>
                </span>
              </article>;
            })}
          </div>

          {run.errorSummary ? (
            <div className="icai-run-error">
              <Icon name="shield" />
              <span><strong>Run issue</strong><small>{run.errorSummary}</small></span>
            </div>
          ) : null}

          <div className="icai-section-heading">
            <div>
              <h3>Next step</h3>
              <p className="icai-muted">Open Synced data & review to see direct ICAI PDFs, exam dates and anything requiring approval.</p>
            </div>
            <Link className="ui-button ui-button--primary ui-button--sm" href="/admin/icai-sync/data">Review synced data</Link>
          </div>
        </section>
      ) : !active ? (
        <EmptyState icon="clock" title="No synchronization run yet" description="Run it now or wait for the configured Cloudflare schedule." />
      ) : null}

      <details className="icai-section icai-disclosure">
        <summary>Source & file recovery</summary>
        <div className="icai-section-heading"><div><span className="eyebrow">Recovery controls</span><h2>Sources and files</h2><p className="icai-muted">Targeted runs preserve canonical data and are disabled while another sync owns the lock.</p></div>
          <form action={runTargetedIcaiSyncAction}><input type="hidden" name="mode" value="failed_only"/><button disabled={active} className="ui-button ui-button--sm">Run failed sources</button></form>
        </div>
        <div className="icai-result-list">
          {dashboard.sources.filter(source=>source.isActive).map(source=><article key={source.id}><span><span><strong>{source.name}</strong><small>{source.excludedUntil ? `Excluded until ${time(source.excludedUntil)}` : source.lastError ?? "Ready"}</small></span></span><span className="icai-runtime-actions">
            <a className="ui-button ui-button--sm" href={source.officialUrl} target="_blank" rel="noreferrer">Open ICAI page</a>
            {source.lastError ? <CopyFailureButton detail={source.lastError}/> : null}
            <form action={runTargetedIcaiSyncAction}><input type="hidden" name="mode" value="one"/><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Run source</button></form>
            <form action={runTargetedIcaiSyncAction}><input type="hidden" name="mode" value="force"/><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Force recheck</button></form>
            {source.lastError ? <><form action={runTargetedIcaiSyncAction}><input type="hidden" name="mode" value="retry_source"/><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Retry failed source</button></form></> : null}
            {source.excludedUntil ? <form action={restoreIcaiSourceAction}><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Restore source</button></form> : <form action={excludeIcaiSourceAction}><input type="hidden" name="sourceId" value={source.id}/><button disabled={active} className="ui-button ui-button--sm">Exclude 24h</button></form>}
          </span></article>)}
        </div>
        {dashboard.latestRun && dashboard.itemDiagnostics.length ? <div className="icai-item-diagnostics">
          <div className="icai-section-heading"><div><span className="eyebrow">Item diagnostics</span><h3>Nested-page execution</h3><p className="icai-muted">A failed page is isolated from the rest of its source. Retry rescans only affected source(s) so canonical comparison remains complete.</p></div><Badge tone="neutral">{dashboard.itemDiagnostics.length} items</Badge></div>
          <div className="icai-runtime-actions">
            <form action={retryIcaiItemsAction}><input type="hidden" name="runId" value={dashboard.latestRun.id}/><input type="hidden" name="mode" value="failed"/><button className="ui-button ui-button--sm">Retry failed items</button></form>
            <form action={retryIcaiItemsAction}><input type="hidden" name="runId" value={dashboard.latestRun.id}/><input type="hidden" name="mode" value="timed_out"/><button className="ui-button ui-button--sm">Retry timed-out items</button></form>
          </div>
          <div className="icai-result-list">{dashboard.itemDiagnostics.map((item)=><article key={item.id}><span><i className={`is-${item.status}`}/><span><strong>{item.itemTitle ?? item.itemUrl}</strong><small>{item.status.replaceAll("_"," ")} · {item.attempts} attempt(s){item.durationMs == null ? "" : ` · ${item.durationMs}ms`}{item.failureMessage ? ` · ${item.failureMessage}` : ""}</small><a href={item.itemUrl} target="_blank" rel="noreferrer">Open ICAI page</a></span></span><div className="icai-runtime-actions">{item.retryEligible ? <form action={retryIcaiItemsAction}><input type="hidden" name="mode" value="one"/><input type="hidden" name="itemId" value={item.id}/><button className="ui-button ui-button--sm">Retry item</button></form> : null}<form action={excludeIcaiDiagnosticItemAction}><input type="hidden" name="sourceId" value={item.sourceId}/><input type="hidden" name="itemUrl" value={item.itemUrl}/><input type="hidden" name="scope" value="temporary"/><button className="ui-button ui-button--sm">Exclude 24h</button></form><form action={excludeIcaiDiagnosticItemAction}><input type="hidden" name="sourceId" value={item.sourceId}/><input type="hidden" name="itemUrl" value={item.itemUrl}/><input type="hidden" name="scope" value="permanent"/><button className="ui-button ui-button--sm">Exclude until restored</button></form></div></article>)}</div>
        </div> : null}
        {dashboard.skippedItems.length ? <div className="icai-result-list">{dashboard.skippedItems.map(item=><article key={item.id}><span><span><strong>{item.itemUrl}</strong><small>{item.scope}{item.skippedUntil ? ` · until ${time(item.skippedUntil)}` : ""}</small></span></span><form action={restoreIcaiItemAction}><input type="hidden" name="skipId" value={item.id}/><button className="ui-button ui-button--sm">Restore file</button></form></article>)}</div> : null}
      </details>

      <details className="icai-section icai-disclosure">
        <summary>Recent run history</summary>
        <div className="icai-section-heading">
          <div><span className="eyebrow">Recent runs</span><h2>Execution history</h2></div>
        </div>
        <div className="icai-history">
          {dashboard.recentRuns.map((item) => (
            <div key={item.id}>
              <span><Badge tone={tone(item.status)}>{item.status}</Badge><strong>{item.triggerType} sync</strong><small>{time(item.startedAt)}</small></span>
              <span><small>{item.sourceSucceeded} succeeded · {item.sourceFailed} failed</small><strong>{duration(item.startedAt, item.completedAt)}</strong></span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
