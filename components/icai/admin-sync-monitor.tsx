import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SyncLiveRefresh } from "./sync-live-refresh";
import type { AppRole } from "@/lib/authorization/roles";
import type { IcaiAdminDashboard } from "@/lib/icai/types";
import {
  decideIcaiReviewAction,
  runIcaiSyncAction,
} from "@/app/(admin)/admin/icai-sync/actions";

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
  const ms =
    (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function tone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["success", "completed", "succeeded", "fetched"].includes(status))
    return "success";
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
  const activeSources = dashboard.sources.filter((source) => source.isActive).length;

  return (
    <div className="icai-page icai-admin-page">
      <section className="icai-hero">
        <div>
          <Badge tone="warning">Admin operations</Badge>
          <h1>ICAI Sync</h1>
          <p>
            Fetch, verify and audit official ICAI academic updates. Active runs use a compact live-status feed instead of repeatedly reloading this entire page.
          </p>
        </div>
        <form action={runIcaiSyncAction}>
          <button
            type="submit"
            disabled={active}
            className="ui-button ui-button--primary ui-button--lg"
          >
            <span>{active ? "Sync in progress" : "Run Sync now"}</span>
          </button>
        </form>
      </section>

      {notice ? (
        <div className="auth-status auth-status--success" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="auth-status auth-status--danger" role="alert">
          {error}
        </div>
      ) : null}

      <section className="icai-admin-summary">
        <div>
          <span>Operator</span>
          <strong>{role.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <span>System state</span>
          <strong>{active ? "sync active" : run?.status ?? "ready"}</strong>
        </div>
        <div>
          <span>Live monitoring</span>
          <strong>{active ? "5s → 15s adaptive" : "stopped"}</strong>
        </div>
        <div>
          <span>Current scheduler</span>
          <strong>Daily schedule</strong>
        </div>
      </section>

      <SyncLiveRefresh
        active={active}
        runId={run?.id ?? null}
        labels={liveLabels}
      />

      {!active && run ? (
        <section className="icai-section">
          <div className="icai-section-heading">
            <div>
              <span className="eyebrow">Latest completed run</span>
              <h2>Fetch results</h2>
              <p className="icai-muted">
                Started {time(run.startedAt)} · {run.completedAt
                  ? `finished ${time(run.completedAt)} in ${duration(run.startedAt, run.completedAt)}`
                  : `last observed after ${duration(run.startedAt, null)}`}
              </p>
            </div>
            <Badge tone={tone(run.status)}>{run.status}</Badge>
          </div>
          <div className="icai-run-stats">
            <div>
              <span>Processed</span>
              <strong>{run.sourceProcessed}/{run.sourceTotal}</strong>
            </div>
            <div>
              <span>Succeeded</span>
              <strong>{run.sourceSucceeded}</strong>
            </div>
            <div>
              <span>Failed</span>
              <strong>{run.sourceFailed}</strong>
            </div>
            <div>
              <span>New</span>
              <strong>{run.newItems}</strong>
            </div>
            <div>
              <span>Changed</span>
              <strong>{run.changedItems}</strong>
            </div>
            <div>
              <span>Unchanged</span>
              <strong>{run.unchangedItems}</strong>
            </div>
          </div>
          <div className="icai-result-list">
            {dashboard.sourceResults.map((result) => (
              <article key={result.sourceId}>
                <span>
                  <i className={`is-${result.state}`} />
                  <span>
                    <strong>{result.sourceName}</strong>
                    <small>
                      {result.error ??
                        (result.fetchedAt
                          ? `Fetched ${time(result.fetchedAt)}`
                          : "Not fetched in this run")}
                    </small>
                  </span>
                </span>
                <span>
                  <Badge tone={tone(result.state)}>{result.state.replaceAll("_", " ")}</Badge>
                  <small>{result.httpStatus ? `HTTP ${result.httpStatus}` : "No response"}</small>
                  <small>{result.parsedItemCount === null ? "—" : `${result.parsedItemCount} items`}</small>
                  {result.changed !== null ? (
                    <small>{result.changed ? "Content changed" : "No change"}</small>
                  ) : null}
                </span>
              </article>
            ))}
          </div>
          {run.errorSummary ? (
            <div className="icai-run-error">
              <Icon name="shield" />
              <span>
                <strong>Run failure</strong>
                <small>{run.errorSummary}</small>
              </span>
            </div>
          ) : null}
        </section>
      ) : !active ? (
        <EmptyState
          icon="clock"
          title="No synchronization run yet"
          description="Run it now or wait for the configured Cloudflare schedule."
        />
      ) : null}

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">Recent runs</span>
            <h2>Execution history</h2>
          </div>
        </div>
        <div className="icai-history">
          {dashboard.recentRuns.map((item) => (
            <div key={item.id}>
              <span>
                <Badge tone={tone(item.status)}>{item.status}</Badge>
                <strong>{item.triggerType} sync</strong>
                <small>{time(item.startedAt)}</small>
              </span>
              <span>
                <small>{item.sourceSucceeded} fetched · {item.sourceFailed} failed</small>
                <strong>{duration(item.startedAt, item.completedAt)}</strong>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">High-impact verification</span>
            <h2>Review queue</h2>
          </div>
          <Badge tone={dashboard.reviews.length ? "warning" : "success"}>
            {dashboard.reviews.length} pending
          </Badge>
        </div>
        {dashboard.reviews.length ? (
          <div className="icai-review-list">
            {dashboard.reviews.map((review) => (
              <article key={review.id}>
                <div>
                  <Badge tone="warning">{Math.round(review.confidence * 100)}% confidence</Badge>
                  <h3>{review.title}</h3>
                  <p>{review.reason}</p>
                  <small>{review.sourceName} · {time(review.createdAt)}</small>
                  <a href={review.sourceUrl} target="_blank" rel="noreferrer">
                    Inspect official source <Icon name="arrow" size={14} />
                  </a>
                </div>
                <div className="icai-review-actions">
                  <form action={decideIcaiReviewAction}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button className="ui-button ui-button--primary ui-button--sm" type="submit">Approve</button>
                  </form>
                  <form action={decideIcaiReviewAction}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button className="ui-button ui-button--secondary ui-button--sm" type="submit">Reject</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon="check"
            title="No date changes need review"
            description="Exam dates remain unchanged until an admin approves a detected change."
          />
        )}
      </section>

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">Source registry</span>
            <h2>Official source health</h2>
          </div>
          <Badge tone="neutral">{activeSources} active</Badge>
        </div>
        <div className="icai-source-table">
          {dashboard.sources.map((source) => (
            <article key={source.id} className={source.failures ? "has-error" : ""}>
              <div>
                <span className="icai-source-health"><i />{source.name}</span>
                <a href={source.officialUrl} target="_blank" rel="noreferrer">{source.officialUrl}</a>
                <div className="icai-source-flags">
                  <Badge tone={source.isActive ? "success" : "neutral"}>{source.isActive ? "active" : "disabled"}</Badge>
                  <Badge tone={source.trustLevel === "high_impact" ? "warning" : "neutral"}>
                    {source.trustLevel.replaceAll("_", " ")}
                  </Badge>
                </div>
              </div>
              <dl>
                <div><dt>Last attempt</dt><dd>{time(source.lastAttemptAt)}</dd></div>
                <div><dt>Last success</dt><dd>{time(source.lastSuccessAt)}</dd></div>
                <div><dt>Failures</dt><dd>{source.failures}</dd></div>
                <div><dt>Parser</dt><dd>{source.parserVersion}</dd></div>
                <div>
                  <dt>Content hash</dt>
                  <dd>{source.lastContentHash ? `${source.lastContentHash.slice(0, 10)}…` : "No snapshot"}</dd>
                </div>
              </dl>
              {source.lastError ? <p>{source.lastError}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">Audit trail</span>
            <h2>Recent detected changes</h2>
          </div>
        </div>
        {dashboard.recentChanges.length ? (
          <div className="icai-change-list">
            {dashboard.recentChanges.map((change) => (
              <div key={change.id}>
                <span>
                  <Badge tone={change.riskLevel === "high" ? "warning" : "neutral"}>{change.changeType}</Badge>
                  <strong>{change.entityType}</strong>
                  <small>{change.entityId}</small>
                </span>
                <span>
                  {change.decisionStatus}
                  <small>{time(change.detectedAt)}</small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon="shield"
            title="No changes recorded yet"
            description="The audit trail starts when a sync detects a new, changed or removed item."
          />
        )}
      </section>
    </div>
  );
}
