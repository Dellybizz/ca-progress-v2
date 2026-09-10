"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { IcaiPublicCatalog, IcaiResourceType } from "@/lib/icai/types";
import { AcademicBreadcrumbs, AcademicContextBar, AcademicEntityMark, AcademicStateBadge, type AcademicContentState } from "@/components/academic/academic-navigation";

const TYPE_LABELS: Record<IcaiResourceType, string> = {
  rtp: "RTP",
  mtp: "MTP",
  study_material: "Study material",
  statutory_update: "Statutory update",
  amendment: "Amendment",
  question_paper: "Question paper",
  suggested_answer: "Suggested answer",
  schedule: "Schedule",
  announcement: "Announcement",
};

function dateLabel(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function resourceState(resource: IcaiPublicCatalog["resources"][number]): AcademicContentState {
  if (["unavailable", "withdrawn", "inactive"].includes(resource.status)) return "Unavailable";
  if (resource.status === "historical") return "Historical";
  if (resource.status === "changed") return "Changed";
  if (resource.status === "new") return "New";
  return "Current";
}

export function IcaiResourceBrowser({ catalog }: { catalog: IcaiPublicCatalog }) {
  const [view, setView] = useState<"folders" | "list">("folders");
  return (
    <div className="icai-page">
      <AcademicBreadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Resources", href: "/resources" }, { label: "ICAI" }]}/>
      <section className="icai-hero">
        <div>
          <Badge tone="success">Official-source verified</Badge>
          <h1>ICAI Resources</h1>
          <p>Browse verified ICAI and Board of Studies metadata with direct official links. CA Progress does not mirror ICAI study-material bodies.</p>
        </div>
        <div className="icai-verified-panel">
          <Icon name="shield" size={22}/>
          <span><strong>Last verified dataset</strong><small>{catalog.verifiedAt ? dateLabel(catalog.verifiedAt) : "Awaiting first successful source sync"}</small></span>
        </div>
      </section>

      <AcademicContextBar level={catalog.levels.find((level) => level.code === catalog.filters.level)?.name ?? "All levels"} attempt={catalog.filters.attempt || null}/>

      <form className="icai-filters" method="get">
        <label><span>Level</span><select name="level" defaultValue={catalog.filters.level}><option value="">All levels</option>{catalog.levels.map((level) => <option key={level.code} value={level.code}>{level.name}</option>)}</select></label>
        <label><span>Attempt</span><select name="attempt" defaultValue={catalog.filters.attempt}><option value="">All attempts</option>{catalog.attempts.filter((attempt, index, rows) => rows.findIndex((row) => row.key === attempt.key) === index).map((attempt) => <option key={attempt.key} value={attempt.key}>{attempt.label}</option>)}</select></label>
        <label><span>Subject</span><select name="subject" defaultValue={catalog.filters.subject}><option value="">All subjects</option>{catalog.subjects.filter((subject) => !catalog.filters.level || subject.levelCode === catalog.filters.level).map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>
        <label><span>Resource type</span><select name="type" defaultValue={catalog.filters.type}><option value="">All resources</option>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="ui-button ui-button--primary ui-button--md" type="submit"><span>Apply filters</span></button>
      </form>

      {catalog.events.length ? (
        <section className="icai-section">
          <div className="icai-section-heading"><div><span className="eyebrow">Verified dates</span><h2>Exam events</h2></div><Badge tone="info">{catalog.events.length} matched</Badge></div>
          <div className="icai-event-grid">{catalog.events.slice(0, 12).map((event) => (
            <article className="icai-event-card" key={event.id}>
              <span className="icai-event-date">{dateLabel(event.eventDate)}</span>
              <div><strong>{event.title}</strong><small>{event.attemptLabel} · {event.levelCode}</small></div>
              <a href={event.sourceUrl} target="_blank" rel="noreferrer">Official source <Icon name="arrow" size={14}/></a>
            </article>
          ))}</div>
        </section>
      ) : null}

      <section className="icai-section">
        <div className="icai-section-heading"><div><span className="eyebrow">Verified resource library</span><h2>Official ICAI links</h2></div><div className="academic-view-controls" role="group" aria-label="Resource view"><button type="button" className={view === "folders" ? "is-active" : ""} onClick={() => setView("folders")}>Folders</button><button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>List</button><Badge tone="neutral">{catalog.resources.length} results</Badge></div></div>
        {catalog.resources.length ? (
          <div className={`icai-resource-grid ${view === "list" ? "is-list" : ""}`}>{catalog.resources.map((resource) => (
            <article className="icai-resource-card" key={resource.id}>
              <div className="icai-resource-card__top"><AcademicEntityMark kind="resource" label={TYPE_LABELS[resource.type]}/><AcademicStateBadge state={resourceState(resource)}/><span className="icai-official-mark"><Icon name="shield" size={14}/> Official</span></div>
              <h3>{resource.title}</h3>
              {resource.summary ? <p>{resource.summary}</p> : <p>Metadata verified from the linked official ICAI source.</p>}
              <div className="icai-tags">{resource.levelCodes.map((level) => <span key={level}>{level}</span>)}{resource.attemptKeys.slice(0, 3).map((attempt) => <span key={attempt}>{attempt}</span>)}{resource.subjects.slice(0, 2).map((subject) => <span key={subject.id}>{subject.title}</span>)}</div>
              <dl className="icai-provenance"><div><dt>Source</dt><dd>{resource.sourceName}</dd></div><div><dt>First seen</dt><dd>{dateLabel(resource.firstSeenAt)}</dd></div><div><dt>Last verified</dt><dd>{dateLabel(resource.lastVerifiedAt)}</dd></div></dl>
              <div className="icai-resource-card__actions"><a href={resource.officialUrl} target="_blank" rel="noreferrer">Open official resource <Icon name="arrow" size={15}/></a><a href={resource.sourceUrl} target="_blank" rel="noreferrer">Source page</a></div>
            </article>
          ))}</div>
        ) : <EmptyState icon="book" title="No verified resources match these filters" description="Choose broader filters, or check again after the next daily ICAI source verification run."/>}
      </section>
    </div>
  );
}
