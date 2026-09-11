import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ICAI_RESOURCE_TYPES, type IcaiAdminDashboard, type IcaiPublicCatalog } from "@/lib/icai/types";
import { decideIcaiReviewAction, manageExamEventAction } from "@/app/(admin)/admin/icai-sync/actions";
import { manageExamDateEstimateAction } from "@/app/(admin)/admin/icai-sync/estimate-actions";
import type { AdminExamDateEstimate } from "@/lib/icai/exam-date-estimates";

function time(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPdf(url: string | null) {
  if (!url) return false;
  try { return /\.pdf$/i.test(new URL(url).pathname); } catch { return false; }
}

function changeState(firstSeenAt: string, lastChangedAt: string) {
  return firstSeenAt === lastChangedAt ? "new" : "changed";
}

function duplicateKey(resource: IcaiPublicCatalog["resources"][number]) {
  const title = resource.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return [resource.type, title, [...resource.levelCodes].sort().join(","), resource.subjects.map((item) => item.id).sort().join(",")].join("|");
}

function reviewPreview(
  review: IcaiAdminDashboard["reviews"][number],
  catalog: IcaiPublicCatalog,
) {
  const patch = review.proposedPatch;
  const resource = catalog.resources.find((item) => item.id === review.entityId);
  const patchUrl = text(patch.source_url);

  if (review.entityType === "exam_event") {
    const date = text(patch.event_date);
    return {
      label: "Exam date shown to students",
      title: text(patch.title) ?? review.title.replace(/^Exam event review:\s*/i, ""),
      detail: date ? time(date) : "Date change detected",
      url: patchUrl ?? review.sourceUrl,
      urlLabel: "Open official exam notification",
    };
  }

  if (review.entityType === "exam_attempt") {
    const start = text(patch.start_date);
    const end = text(patch.end_date);
    const range = start && end && start !== end ? `${time(start)} – ${time(end)}` : time(start ?? end);
    return {
      label: "Countdown / attempt date shown to students",
      title: text(patch.label) ?? review.title.replace(/^Exam attempt review:\s*/i, ""),
      detail: range,
      url: patchUrl ?? review.sourceUrl,
      urlLabel: "Open official exam notification",
    };
  }

  return {
    label: "Resource shown to students",
    title: resource?.title ?? review.title.replace(/^ICAI resource removal:\s*/i, ""),
    detail: resource ? resource.type.replaceAll("_", " ") : "ICAI resource",
    url: resource?.officialUrl ?? patchUrl ?? review.sourceUrl,
    urlLabel: isPdf(resource?.officialUrl ?? patchUrl ?? review.sourceUrl) ? "Open ICAI PDF" : "Open official ICAI evidence",
  };
}

export function IcaiAdminSyncData({
  dashboard,
  catalog,
  estimates,
  notice,
  error,
}: {
  dashboard: IcaiAdminDashboard;
  catalog: IcaiPublicCatalog;
  estimates: AdminExamDateEstimate[];
  notice?: string | null;
  error?: string | null;
}) {
  const directPdfs = catalog.resources.filter((item) => isPdf(item.officialUrl)).length;
  const duplicateGroups = [...catalog.resources.reduce((groups, resource) => {
    const key = duplicateKey(resource);
    groups.set(key, [...(groups.get(key) ?? []), resource]);
    return groups;
  }, new Map<string, typeof catalog.resources>()).values()].filter((group) => group.length > 1);
  const unavailableSources = dashboard.sources.filter((source) => source.failures > 0 || source.excludedUntil);
  const examConflicts = [...catalog.events.reduce((groups, event) => {
    const key = `${event.levelCode}:${event.attemptKey}:${event.eventType}`;
    groups.set(key, new Set([...(groups.get(key) ?? []), event.eventDate]));
    return groups;
  }, new Map<string, Set<string>>()).entries()].filter(([, dates]) => dates.size > 1);

  return (
    <div className="icai-page icai-admin-page">
      <section className="icai-hero">
        <div>
          <Badge tone="warning">Admin · ICAI Data</Badge>
          <h1>Synced data & review</h1>
          <p>Read the ICAI data in the same terms students will see: chapter PDFs, exam dates and official notifications. Technical sync controls stay on the Sync page.</p>
          <div className="icai-source-flags">
            <Link className="ui-button ui-button--secondary ui-button--sm" href="/admin/icai-sync">1. Sync & progress</Link>
            <Badge tone="info">2. Synced data & review</Badge>
          </div>
        </div>
      </section>

      {notice ? <div className="auth-status auth-status--success" role="status">{notice}</div> : null}
      {error ? <div className="auth-status auth-status--danger" role="alert">{error}</div> : null}

      <section className="icai-admin-summary">
        <div><span>Synced resources</span><strong>{catalog.resources.length}</strong></div>
        <div><span>Direct PDFs</span><strong>{directPdfs}</strong></div>
        <div><span>Exam dates</span><strong>{catalog.events.length}</strong></div>
        <div><span>Needs review</span><strong>{dashboard.reviews.length}</strong></div>
      </section>

      <section className="icai-section icai-content-filters">
        <div className="icai-section-heading"><div><span className="eyebrow">Content filters</span><h2>Find synced information</h2></div></div>
        <form method="get" className="icai-filters">
          <label>Level<select name="level" defaultValue={catalog.filters.level}><option value="">All levels</option>{catalog.levels.map((level) => <option key={level.code} value={level.code}>{level.name}</option>)}</select></label>
          <label>Attempt<select name="attempt" defaultValue={catalog.filters.attempt}><option value="">All attempts</option>{catalog.attempts.map((attempt) => <option key={attempt.id} value={attempt.key}>{attempt.label}</option>)}</select></label>
          <label>Subject<select name="subject" defaultValue={catalog.filters.subject}><option value="">All subjects</option>{catalog.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>
          <label>Resource type<select name="type" defaultValue={catalog.filters.type}><option value="">All resource types</option>{ICAI_RESOURCE_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
          <button className="ui-button ui-button--primary" type="submit">Apply filters</button>
          <Link className="ui-button ui-button--secondary" href="/admin/icai-sync/data">Clear</Link>
        </form>
      </section>

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">Approval queue</span>
            <h2>What will students see?</h2>
            <p className="icai-muted">Review the proposed student-facing value and its official ICAI evidence. Approve only when those two agree.</p>
          </div>
          <Badge tone={dashboard.reviews.length ? "warning" : "success"}>{dashboard.reviews.length} pending</Badge>
        </div>

        {dashboard.reviews.length ? (
          <div className="icai-review-list">
            {dashboard.reviews.map((review) => {
              const preview = reviewPreview(review, catalog);
              return (
                <article key={review.id}>
                  <div>
                    <Badge tone="warning">{Math.round(review.confidence * 100)}% confidence</Badge>
                    <span className="eyebrow">{preview.label}</span>
                    <h3>{preview.title}</h3>
                    <p><strong>{preview.detail}</strong></p>
                    <p>{review.reason}</p>
                    <small>{review.sourceName} · detected {time(review.createdAt)}</small>
                    {preview.url ? (
                      <a href={preview.url} target="_blank" rel="noreferrer">
                        {preview.urlLabel} <Icon name="arrow" size={14} />
                      </a>
                    ) : null}
                    <details className="icai-evidence-details"><summary>Technical evidence</summary><pre>{JSON.stringify(review.proposedPatch, null, 2)}</pre></details>
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
              );
            })}
          </div>
        ) : (
          <EmptyState compact icon="check" title="Nothing needs approval" description="Verified synced data is already available below." />
        )}
      </section>

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">Student-facing exam information</span>
            <h2>Exam dates and countdown sources</h2>
          </div>
        </div>
        <form action={manageExamDateEstimateAction} className="icai-filters">
          <input type="hidden" name="intent" value="save" />
          <label>Level<select name="levelCode" required><option value="">Select level</option>{catalog.levels.map((level) => <option key={level.code} value={level.code}>{level.name}</option>)}</select></label>
          <label>Attempt<select name="attemptKey" required><option value="">Select attempt</option>{[...new Map(catalog.attempts.map((attempt) => [attempt.key, attempt])).values()].map((attempt) => <option key={attempt.key} value={attempt.key}>{attempt.label}</option>)}</select></label>
          <label>Group<select name="groupChoice" required><option value="">Select group</option><option value="not_applicable">All papers (Foundation)</option><option value="group_1">Group 1</option><option value="group_2">Group 2</option><option value="both">Both groups</option></select></label>
          <label>Provisional first exam date<input name="estimatedDate" type="date" required /></label>
          <label>Admin note<input name="note" maxLength={300} placeholder="Planning estimate source or rationale" /></label>
          <button className="ui-button ui-button--primary" type="submit">Publish provisional date</button>
        </form>
        <p className="icai-muted">Students see this only when no verified ICAI exam event matches their level, attempt and group. Verified sync data replaces it automatically.</p>
        {estimates.length ? <div className="icai-result-list">{estimates.map((estimate) => <article key={`${estimate.levelCode}:${estimate.attemptKey}:${estimate.groupChoice}`}><span><span><strong>{time(estimate.estimatedDate)}</strong><small>{estimate.levelCode} · {estimate.attemptKey} · {estimate.groupChoice.replaceAll("_", " ")}{estimate.note ? ` · ${estimate.note}` : ""}</small></span></span><span><Badge tone="warning">provisional</Badge><form action={manageExamDateEstimateAction}><input type="hidden" name="intent" value="remove"/><input type="hidden" name="levelCode" value={estimate.levelCode}/><input type="hidden" name="attemptKey" value={estimate.attemptKey}/><input type="hidden" name="groupChoice" value={estimate.groupChoice}/><button className="ui-button ui-button--danger ui-button--sm" type="submit">Remove</button></form></span></article>)}</div> : null}
        {examConflicts.length ? <div className="auth-status auth-status--warning" role="alert">{examConflicts.length} conflicting exam-date mapping{examConflicts.length === 1 ? "" : "s"} detected. Compare the official evidence before replacing or withdrawing a date.</div> : null}
        {catalog.events.length ? (
          <div className="icai-result-list">
            {catalog.events.map((event) => (
              <article key={event.id}>
                <span>
                  <span>
                    <strong>{event.title}</strong>
                    <small>{event.levelCode} · {event.attemptLabel || event.attemptKey}</small>
                  </span>
                </span>
                <span>
                  <strong>{time(event.eventDate)}</strong>
                  <Badge tone="info">countdown evidence</Badge>
                  <a href={event.sourceUrl} target="_blank" rel="noreferrer">Official notification <Icon name="arrow" size={14} /></a>
                  <details className="icai-evidence-details"><summary>Replace or withdraw</summary>
                    <form action={manageExamEventAction}><input type="hidden" name="eventId" value={event.id}/><input type="hidden" name="intent" value="replace"/><label>Title<input name="title" defaultValue={event.title} required/></label><label>Exam date<input name="eventDate" type="date" defaultValue={event.eventDate} required/></label><label>Official evidence URL<input name="sourceUrl" type="url" defaultValue={event.sourceUrl} required/></label><button className="ui-button ui-button--secondary ui-button--sm" type="submit">Replace</button></form>
                    <form action={manageExamEventAction}><input type="hidden" name="eventId" value={event.id}/><input type="hidden" name="intent" value="withdraw"/><button className="ui-button ui-button--danger ui-button--sm" type="submit">Withdraw</button></form>
                  </details>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState compact icon="clock" title="No verified exam dates yet" description="Exam dates appear here after ICAI sync verifies them." />
        )}
        {catalog.attempts.filter((attempt) => attempt.startDate || attempt.endDate).length ? (
          <details className="icai-disclosure">
            <summary>Attempt dates used by student countdowns</summary>
            <div className="icai-result-list">
              {catalog.attempts.filter((attempt) => attempt.startDate || attempt.endDate).map((attempt) => <article key={attempt.id}><span><span><strong>{attempt.label}</strong><small>{attempt.levelCode}</small></span></span><span><strong>{time(attempt.startDate ?? attempt.endDate)}</strong><a href={attempt.sourceUrl} target="_blank" rel="noreferrer">Official evidence <Icon name="arrow" size={14}/></a></span></article>)}
            </div>
          </details>
        ) : null}
      </section>

      <section className="icai-section icai-student-preview">
        <div className="icai-section-heading"><div><span className="eyebrow">Student preview</span><h2>What students currently see</h2><p className="icai-muted">This uses the same verified catalog and active filters as the student ICAI surfaces.</p></div><Badge tone="success">verified content</Badge></div>
        <div className="icai-run-stats">
          <div><span>Resources visible</span><strong>{catalog.resources.length}</strong></div>
          <div><span>Exam dates visible</span><strong>{catalog.events.length}</strong></div>
          <div><span>Direct PDFs</span><strong>{directPdfs}</strong></div>
          <div><span>Latest verification</span><strong>{time(catalog.verifiedAt)}</strong></div>
        </div>
      </section>

      <section className="icai-section">
        <div className="icai-section-heading">
          <div>
            <span className="eyebrow">Student-facing resources</span>
            <h2>Synced ICAI resources</h2>
            <p className="icai-muted">Study Material entries should open the ICAI chapter PDF directly, not an ICAI page containing another list of links.</p>
          </div>
        </div>
        {catalog.resources.length ? (
          <div className="icai-result-list">
            {catalog.resources.map((resource) => (
              <article key={resource.id}>
                <span>
                  <span>
                    <strong>{resource.title}</strong>
                    <small>{resource.type.replaceAll("_", " ")}{resource.subjects.length ? ` · ${resource.subjects.map((subject) => subject.title).join(", ")}` : ""}</small>
                  </span>
                </span>
                <span>
                  <Badge tone={changeState(resource.firstSeenAt, resource.lastChangedAt) === "new" ? "info" : "warning"}>{changeState(resource.firstSeenAt, resource.lastChangedAt)}</Badge>
                  <Badge tone={isPdf(resource.officialUrl) ? "success" : "neutral"}>{isPdf(resource.officialUrl) ? "direct PDF" : "official link"}</Badge>
                  <a href={resource.officialUrl} target="_blank" rel="noreferrer">{isPdf(resource.officialUrl) ? "Open PDF" : "Open"} <Icon name="arrow" size={14} /></a>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState compact icon="shield" title="No synced resources yet" description="Run the bootstrap sync first." />
        )}
      </section>

      <section className="icai-section">
        <div className="icai-section-heading"><div><span className="eyebrow">Duplicate inspection</span><h2>Possible duplicate groups</h2><p className="icai-muted">Items are grouped by student-facing title, type, level and subject. Nothing is merged from this view.</p></div><Badge tone={duplicateGroups.length ? "warning" : "success"}>{duplicateGroups.length} groups</Badge></div>
        {duplicateGroups.length ? <div className="icai-review-list">{duplicateGroups.map((group) => <article key={duplicateKey(group[0])}><div><h3>{group[0].title}</h3><p>{group.length} matching resources</p><details className="icai-evidence-details"><summary>Inspect links and identifiers</summary>{group.map((item) => <p key={item.id}><a href={item.officialUrl} target="_blank" rel="noreferrer">{item.id} · {item.officialUrl}</a></p>)}</details></div></article>)}</div> : <EmptyState compact icon="check" title="No possible duplicates" description="The current filtered catalog contains no matching content groups."/>}
      </section>

      <details className="icai-section icai-disclosure">
        <summary>Official source evidence and availability</summary>
        <div className="icai-section-heading"><div><span className="eyebrow">Supporting evidence</span><h2>Official ICAI sources</h2></div><Badge tone={unavailableSources.length ? "warning" : "success"}>{unavailableSources.length ? `${unavailableSources.length} unavailable` : "all available"}</Badge></div>
        <div className="icai-source-table">
          {dashboard.sources.map((source) => (
            <article key={source.id} className={source.failures ? "has-error" : ""}>
              <div>
                <span className="icai-source-health"><i />{source.name}</span>
                <a href={source.officialUrl} target="_blank" rel="noreferrer">Official source page</a>
              </div>
              <dl>
                <div><dt>Last success</dt><dd>{time(source.lastSuccessAt)}</dd></div>
                <div><dt>Failures</dt><dd>{source.failures}</dd></div>
              </dl>
              {source.lastError ? <p>{source.lastError}</p> : null}
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}
