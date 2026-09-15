"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { controlIcaiSyncAction, recoverIcaiStartupJobAction, skipIcaiItemAction } from "@/app/(admin)/admin/icai-sync/actions";
import {
  ICAI_STAGE_PROGRESS,
  type IcaiSyncLiveStatus,
} from "@/lib/icai/live-status";

function elapsed(value: string | null | undefined, now: string | undefined) {
  if (!value) return "—";
  const start = new Date(value).getTime();
  const end = now ? new Date(now).getTime() : Date.now();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function tone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["success", "completed", "fetched"].includes(status)) return "success";
  if (["failed", "dead_letter"].includes(status)) return "danger";
  if (["running", "queued", "pending"].includes(status)) return "info";
  return ["partial", "skipped", "stalled"].includes(status) ? "warning" : "neutral";
}

function timestamp(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(parsed);
}

export function SyncLiveRefresh({
  active,
  runId,
  labels,
}: {
  active: boolean;
  runId: string | null;
  labels: {
    live: string;
    skip: string;
    cancel: string;
    recover: string;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<IcaiSyncLiveStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const pollingStartedAt = Date.now();

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const schedule = (poll: () => void) => {
      clearTimer();
      if (disposed || document.visibilityState === "hidden") return;
      const delay = Date.now() - pollingStartedAt < 60_000 ? 5_000 : 15_000;
      timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (disposed || document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
      try {
        const response = await fetch(`/api/admin/icai-sync/status${query}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const body = (await response.json()) as IcaiSyncLiveStatus | { error?: string };
        if (!response.ok) {
          throw new Error("error" in body && body.error ? body.error : "Status request failed.");
        }
        const next = body as IcaiSyncLiveStatus;
        if (disposed) return;
        setStatus(next);
        setPollError(null);
        if (!next.active) {
          clearTimer();
          if (!refreshed.current) {
            refreshed.current = true;
            router.refresh();
          }
          return;
        }
        schedule(poll);
      } catch (error) {
        if (disposed || controller?.signal.aborted) return;
        setPollError(error instanceof Error ? error.message : "Live status is temporarily unavailable.");
        schedule(poll);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearTimer();
        controller?.abort();
      } else {
        void poll();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => {
      disposed = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, runId, router]);

  if (!active) return null;

  if (!status) {
    return (
      <section className="icai-section icai-runtime-panel" aria-live="polite">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">{labels.live}</span>
            <h2>Connecting to the sync worker</h2>
            <p className="icai-muted">
              Loading compact live status without refreshing the full admin page.
            </p>
          </div>
          <Badge tone={pollError ? "warning" : "info"}>{pollError ? "retrying" : "live"}</Badge>
        </div>
        {pollError ? <p className="icai-inline-error">{pollError}</p> : null}
      </section>
    );
  }

  const run = status.run;
  const runtime = status.runtime;
  const processed = run?.processed ?? 0;
  const total = run?.total ?? 0;
  const overallPercent = status.overallPercent;
  const stagePercent = runtime ? (ICAI_STAGE_PROGRESS[runtime.stage] ?? 0) : 0;
  const stale = status.displayState === "stalled";
  const remainingSources = Math.max(0, total - processed);
  const liveMetrics = status.sourceResults.reduce((total, result) => ({
    pages: total.pages + result.pagesChecked,
    pdfs: total.pdfs + result.pdfsResolved,
    unavailable: total.unavailable + result.unavailablePages,
    skipped: total.skipped + result.skippedPages,
  }), { pages: 0, pdfs: 0, unavailable: 0, skipped: 0 });

  return (
    <div className="icai-live-monitor" aria-live="polite">
      <section className="icai-admin-summary">
        <div>
          <span>Live state</span>
          <strong>{status.displayState.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <span>Overall progress</span>
          <strong>{run ? `${overallPercent}% · ${processed}/${total}` : status.displayState === "queued" ? "Queued · worker pending" : status.displayState}</strong>
        </div>
        <div>
          <span>Heartbeat</span>
          <strong>{runtime ? `${elapsed(runtime.heartbeatAt, status.observedAt)} ago` : status.job ? `Job updated ${elapsed(status.job.startedAt ?? status.job.createdAt, status.observedAt)} ago` : "—"}</strong>
        </div>
        <div>
          <span>Next scheduled group</span>
          <strong>{status.nextScheduledGroup ? `${status.nextScheduledGroup.label} · ${timestamp(status.nextScheduledGroup.dueAt)}` : "Not configured"}</strong>
        </div>
      </section>

      <section className="icai-active-run">
        <div>
          <span className="icai-live-dot" />
          <span>
            <small>Active run</small>
            <h2>
              {status.job?.status === "queued"
                ? "Waiting for a worker"
                : runtime?.currentSourceName ?? "Preparing official sources"}
            </h2>
            <p>
              {run
                ? `Run ${status.runId?.slice(0, 8)} · ${run.triggerType} · running ${elapsed(run.startedAt, status.observedAt)}`
                : status.job
                  ? `Job ${status.job.id.slice(0, 8)} · attempt ${status.job.attempts}/${status.job.maxAttempts}`
                  : "Worker startup in progress"}
            </p>
            {status.anotherSyncActive ? <small>Exclusive sync lock active · another sync cannot start</small> : null}
          </span>
          <Badge tone={tone(status.displayState)}>
            {status.job?.status === "failed" ? "retry queued" : status.displayState}
          </Badge>
        </div>
        <div className="icai-progress" aria-label="Overall source progress">
          <i style={{ width: `${overallPercent}%` }} />
        </div>
      </section>

      <section className="icai-section icai-runtime-panel">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">{labels.live}</span>
            <h2>{status.displayState.replaceAll("_", " ")}</h2>
            <p className="icai-muted">
              {runtime?.currentSourceName ?? "Preparing sources"}
              {runtime ? ` · stage ${elapsed(runtime.stageStartedAt, status.observedAt)} · heartbeat ${elapsed(runtime.heartbeatAt, status.observedAt)} ago` : ""}
            </p>
          </div>
          <Badge tone={stale ? "danger" : "info"}>{stale ? "stalled" : "live"}</Badge>
        </div>
        <div className="icai-progress" aria-label="Current source stage progress">
          <i style={{ width: `${stagePercent}%` }} />
        </div>
        <p className="icai-muted">
          Current-source workflow {stagePercent}% · overall {overallPercent}% ({processed}/{total} sources)
          {runtime ? ` · ${remainingSources} sources remaining · batch ${runtime.batchNumber}` : ""}
          {runtime?.cursorTotal ? ` · source items ${runtime.processedItems}/${runtime.cursorTotal} (${runtime.remainingItems} remaining)` : ""}
        </p>
        <div className="icai-run-stats">
          <div><span>Started</span><strong>{run ? timestamp(run.startedAt) : timestamp(status.job?.createdAt)}</strong></div>
          <div><span>Estimated completion</span><strong>{timestamp(status.estimatedCompletionAt)}</strong></div>
          <div><span>Retries</span><strong>{status.job ? `${status.job.attempts}/${status.job.maxAttempts}` : runtime ? `${runtime.continuationCount}` : "0"}</strong></div>
          <div><span>Next retry</span><strong>{timestamp(status.job?.nextRetryAt)}</strong></div>
        </div>
        <details className="icai-disclosure">
          <summary>Live performance metrics</summary>
          <div className="icai-run-stats">
            <div><span>Pages checked</span><strong>{liveMetrics.pages}</strong></div>
            <div><span>PDFs resolved</span><strong>{liveMetrics.pdfs}</strong></div>
            <div><span>Unavailable</span><strong>{liveMetrics.unavailable}</strong></div>
            <div><span>Skipped</span><strong>{liveMetrics.skipped}</strong></div>
            <div><span>New / changed</span><strong>{run ? `${run.newItems} / ${run.changedItems}` : "—"}</strong></div>
            <div><span>Unchanged</span><strong>{run?.unchangedItems ?? 0}</strong></div>
          </div>
        </details>
        {runtime?.currentItemUrl ? (
          <div className="icai-runtime-item">
            <a href={runtime.currentItemUrl} target="_blank" rel="noreferrer">{runtime.currentItemUrl}</a>
            {status.runId && runtime.currentSourceId ? (
              <div className="icai-runtime-actions">
                <form action={skipIcaiItemAction}>
                  <input type="hidden" name="runId" value={status.runId} />
                  <input type="hidden" name="sourceId" value={runtime.currentSourceId} />
                  <input type="hidden" name="itemUrl" value={runtime.currentItemUrl} />
                  <input type="hidden" name="scope" value="temporary" />
                  <button className="ui-button ui-button--sm" type="submit">Skip on future runs for 24h</button>
                </form>
                <form action={skipIcaiItemAction}>
                  <input type="hidden" name="runId" value={status.runId} />
                  <input type="hidden" name="sourceId" value={runtime.currentSourceId} />
                  <input type="hidden" name="itemUrl" value={runtime.currentItemUrl} />
                  <input type="hidden" name="scope" value="permanent" />
                  <button className="ui-button ui-button--sm" type="submit">Skip on all future runs</button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}
        {stale ? (
          <div className="auth-status auth-status--danger" role="alert">
            No heartbeat has been received for more than two minutes. Recovery can safely close the stale run without changing previously verified ICAI data.
          </div>
        ) : null}
        {!run && status.job?.stale ? (
          <div className="auth-status auth-status--danger" role="alert">
            The worker did not create a sync run within two minutes. This startup job is stalled and can be closed safely.
            <form action={recoverIcaiStartupJobAction}>
              <input type="hidden" name="jobId" value={status.job.id} />
              <button className="ui-button ui-button--primary">Recover stalled startup</button>
            </form>
          </div>
        ) : null}
        {status.runId && runtime ? (
          <div className="icai-runtime-actions">
            <form action={controlIcaiSyncAction}>
              <input type="hidden" name="runId" value={status.runId} />
              <input type="hidden" name="intent" value={runtime.stage === "paused" ? "resume" : "pause"} />
              <button className="ui-button">{runtime.stage === "paused" ? "Resume" : "Pause after batch"}</button>
            </form>
            <form action={controlIcaiSyncAction}>
              <input type="hidden" name="runId" value={status.runId} />
              <input type="hidden" name="intent" value="skip" />
              <button className="ui-button" disabled={!runtime.currentSourceId || runtime.skipSourceRequested}>
                {runtime.skipSourceRequested ? "Skip requested" : labels.skip}
              </button>
            </form>
            <form action={controlIcaiSyncAction}>
              <input type="hidden" name="runId" value={status.runId} />
              <input type="hidden" name="intent" value="cancel" />
              <button className="ui-button" disabled={runtime.cancelRequested}>
                {runtime.cancelRequested ? "Cancel requested" : labels.cancel}
              </button>
            </form>
            {stale ? (
              <form action={controlIcaiSyncAction}>
                <input type="hidden" name="runId" value={status.runId} />
                <input type="hidden" name="intent" value="recover" />
                <label><input required type="checkbox" name="confirm" value="clear"/> Confirm stale lock</label>
                <button className="ui-button ui-button--primary">{labels.recover}</button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">Source-by-source status</span>
            <h2>Current fetch results</h2>
          </div>
          <Badge tone="neutral">{status.sourceResults.length} sources</Badge>
        </div>
        <div className="icai-result-list">
          {status.sourceResults.map((result) => (
            <article key={result.sourceId}>
              <span>
                <i className={`is-${result.state}`} />
                <span>
                  <strong>{result.sourceName}</strong>
                  <small>{result.error ?? (result.fetchedAt ? `Fetched ${elapsed(result.fetchedAt, status.observedAt)} ago` : "Awaiting result")}</small>
                  <small>{result.pagesChecked} checked · {result.pdfsResolved} PDFs · {result.unavailablePages + result.skippedPages} unavailable/skipped</small>
                </span>
              </span>
              <span>
                <Badge tone={tone(result.state)}>{result.state.replaceAll("_", " ")}</Badge>
                <small>{result.httpStatus ? `HTTP ${result.httpStatus}` : "No response yet"}</small>
                <small>{result.parsedItemCount === null ? "—" : `${result.parsedItemCount} items`}</small>
                <small>{result.startedAt ? `${elapsed(result.startedAt, result.finishedAt ?? status.observedAt)} · ${result.attempts} attempt${result.attempts === 1 ? "" : "s"}` : "Not started"}</small>
              </span>
            </article>
          ))}
        </div>
      </section>

      {status.latestFailure || pollError ? (
        <section className="icai-section">
          <div className="icai-section-heading">
            <div>
              <span className="eyebrow">Problems requiring attention</span>
              <h2>Latest sync issue</h2>
              <p className="icai-muted">{status.latestFailure ?? pollError}</p>
            </div>
            <Badge tone="danger">attention</Badge>
          </div>
        </section>
      ) : null}
    </div>
  );
}
