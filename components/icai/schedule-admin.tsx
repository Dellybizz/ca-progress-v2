import { Badge } from "@/components/ui/badge";
import type { IcaiScheduleAdminData } from "@/lib/icai/schedule-admin";
import {
  runIcaiScheduleSelectionAction,
  updateIcaiSourceScheduleAction,
} from "@/app/(admin)/admin/icai-sync/schedule-actions";

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

function localIstInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + 330 * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function IcaiScheduleAdmin({
  data,
  active,
}: {
  data: IcaiScheduleAdminData;
  active: boolean;
}) {
  const next = data.overview.nextScheduledGroup;
  return (
    <section className="icai-section">
      <div className="icai-section-heading">
        <div>
          <span className="eyebrow">Phase 4 distributed scheduler</span>
          <h2>Two-hour source schedule</h2>
          <p className="icai-muted">
            Only due sources are selected in each IST window. Failed work remains due, overlapping runs are deferred, and successful sources are rescheduled from their own cadence.
          </p>
        </div>
        <Badge tone={active ? "info" : "success"}>{active ? "sync active" : "scheduler ready"}</Badge>
      </div>

      <div className="icai-admin-summary">
        <div>
          <span>Next window</span>
          <strong>{next?.label ?? "No enabled window"}</strong>
        </div>
        <div>
          <span>Scheduled for</span>
          <strong>{next ? time(next.scheduledFor) : "—"}</strong>
        </div>
        <div>
          <span>Due sources</span>
          <strong>{data.overview.dueSources}</strong>
        </div>
        <div>
          <span>Paused sources</span>
          <strong>{data.overview.pausedSources}</strong>
        </div>
      </div>

      <div className="icai-result-list">
        <article>
          <span>
            <span>
              <strong>Run due sources</strong>
              <small>Queue only sources whose next-due time has passed.</small>
            </span>
          </span>
          <form action={runIcaiScheduleSelectionAction}>
            <input type="hidden" name="mode" value="due" />
            <button className="ui-button ui-button--secondary ui-button--sm" type="submit" disabled={active}>Run due</button>
          </form>
        </article>
        <article>
          <span>
            <span>
              <strong>Retry failures</strong>
              <small>Retry only failed or timed-out item work; successful items are not rerun.</small>
            </span>
          </span>
          <form action={runIcaiScheduleSelectionAction}>
            <input type="hidden" name="mode" value="failed" />
            <button className="ui-button ui-button--secondary ui-button--sm" type="submit" disabled={active}>Retry failed</button>
          </form>
        </article>
        <article>
          <span>
            <span>
              <strong>Run a group</strong>
              <small>Select one scheduling group without fetching the full registry.</small>
            </span>
          </span>
          <form action={runIcaiScheduleSelectionAction}>
            <input type="hidden" name="mode" value="group" />
            <select name="value" required defaultValue={data.windows[0]?.key ?? ""}>
              {data.windows.map((window) => (
                <option key={window.key} value={window.key}>{window.label}</option>
              ))}
            </select>
            <button className="ui-button ui-button--secondary ui-button--sm" type="submit" disabled={active || !data.windows.length}>Run group</button>
          </form>
        </article>
        <article>
          <span>
            <span>
              <strong>High-impact due work</strong>
              <small>Manual safety override for exam/high-impact sources. Explicit confirmation is required.</small>
            </span>
          </span>
          <form action={runIcaiScheduleSelectionAction}>
            <input type="hidden" name="mode" value="high-impact" />
            <label><input type="checkbox" name="confirmation" value="CONFIRM" required /> Confirm</label>
            <button className="ui-button ui-button--secondary ui-button--sm" type="submit" disabled={active}>Run high-impact</button>
          </form>
        </article>
        <article>
          <span>
            <span>
              <strong>Run all active sources</strong>
              <small>Broad manual override, capped by the scheduler safety limit. Use only when intentionally reconciling the registry.</small>
            </span>
          </span>
          <form action={runIcaiScheduleSelectionAction}>
            <input type="hidden" name="mode" value="all" />
            <label><input type="checkbox" name="confirmation" value="CONFIRM" required /> Confirm all</label>
            <button className="ui-button ui-button--secondary ui-button--sm" type="submit" disabled={active}>Run all</button>
          </form>
        </article>
      </div>

      <div className="icai-section-heading">
        <div>
          <span className="eyebrow">Source cadence</span>
          <h3>Per-source scheduling</h3>
          <p className="icai-muted">Intervals are constrained to 6 hours–7 days. Priority controls due-source ordering inside a window.</p>
        </div>
      </div>

      <div className="icai-source-table">
        {data.sources.map((source) => (
          <article key={source.sourceId} className={source.pausedUntil ? "has-error" : ""}>
            <div>
              <span className="icai-source-health"><i />{source.name}</span>
              <a href={source.officialUrl} target="_blank" rel="noreferrer">{source.officialUrl}</a>
              <div className="icai-source-flags">
                <Badge tone={source.isActive ? "success" : "neutral"}>{source.isActive ? "active" : "disabled"}</Badge>
                <Badge tone={source.trustLevel === "high_impact" ? "warning" : "neutral"}>{source.trustLevel.replaceAll("_", " ")}</Badge>
                {source.pausedUntil ? <Badge tone="warning">paused</Badge> : null}
              </div>
            </div>
            <dl>
              <div><dt>Group</dt><dd>{source.syncGroup}</dd></div>
              <div><dt>Next due</dt><dd>{time(source.nextDueAt)}</dd></div>
              <div><dt>Interval</dt><dd>{Math.round(source.intervalMinutes / 60)}h</dd></div>
              <div><dt>Priority</dt><dd>{source.priority}</dd></div>
              <div><dt>Last duration</dt><dd>{source.lastDurationMs == null ? "—" : `${Math.round(source.lastDurationMs / 1000)}s`}</dd></div>
              <div><dt>Last items</dt><dd>{source.lastItemCount ?? "—"}</dd></div>
            </dl>
            <details>
              <summary>Schedule controls</summary>
              <form action={updateIcaiSourceScheduleAction}>
                <input type="hidden" name="action" value="update" />
                <input type="hidden" name="sourceId" value={source.sourceId} />
                <label>
                  Group
                  <select name="syncGroup" defaultValue={source.syncGroup} required>
                    {data.windows.map((window) => (
                      <option key={window.key} value={window.key}>{window.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Interval (minutes)
                  <input type="number" name="intervalMinutes" min={360} max={10080} step={1} defaultValue={source.intervalMinutes} required />
                </label>
                <label>
                  Priority
                  <input type="number" name="priority" min={1} max={100} step={1} defaultValue={source.priority} required />
                </label>
                <label>
                  Next due (IST)
                  <input type="datetime-local" name="nextDueAt" defaultValue={localIstInput(source.nextDueAt)} required />
                </label>
                <button className="ui-button ui-button--secondary ui-button--sm" type="submit">Save schedule</button>
              </form>
              <div className="icai-review-actions">
                <form action={runIcaiScheduleSelectionAction}>
                  <input type="hidden" name="mode" value="source" />
                  <input type="hidden" name="value" value={source.sourceId} />
                  <button className="ui-button ui-button--secondary ui-button--sm" type="submit" disabled={active || Boolean(source.pausedUntil)}>Run source</button>
                </form>
                <form action={updateIcaiSourceScheduleAction}>
                  <input type="hidden" name="action" value="due_now" />
                  <input type="hidden" name="sourceId" value={source.sourceId} />
                  <button className="ui-button ui-button--secondary ui-button--sm" type="submit">Mark due now</button>
                </form>
                {source.pausedUntil ? (
                  <form action={updateIcaiSourceScheduleAction}>
                    <input type="hidden" name="action" value="resume" />
                    <input type="hidden" name="sourceId" value={source.sourceId} />
                    <button className="ui-button ui-button--secondary ui-button--sm" type="submit">Resume</button>
                  </form>
                ) : (
                  <form action={updateIcaiSourceScheduleAction}>
                    <input type="hidden" name="action" value="pause" />
                    <input type="hidden" name="sourceId" value={source.sourceId} />
                    <input type="number" name="hours" min={1} max={168} defaultValue={24} aria-label="Pause hours" required />
                    <input type="text" name="reason" maxLength={500} placeholder="Pause reason" required />
                    <button className="ui-button ui-button--secondary ui-button--sm" type="submit">Pause</button>
                  </form>
                )}
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
