"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { AcademicCatalog, AcademicSearchResult } from "@/lib/academic/types";

function labelFromKey(value: string) {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function selectionHref(catalog: AcademicCatalog, next: { level?: string; group?: string; attempt?: string | null }) {
  const params = new URLSearchParams();
  params.set("level", next.level ?? catalog.selectedLevel.code);
  const group = next.group ?? catalog.selectedGroup;
  if (group) params.set("group", group);
  const attempt = next.attempt === undefined ? catalog.selectedAttempt : next.attempt;
  if (attempt) params.set("attempt", attempt);
  return `/syllabus?${params.toString()}`;
}

export function SyllabusExplorer({ catalog }: { catalog: AcademicCatalog }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AcademicSearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  const searchActive = search.trim().length >= 2;
  const searchUrl = useMemo(() => {
    const params = new URLSearchParams({ q: search, level: catalog.selectedLevel.code, group: catalog.selectedGroup });
    if (catalog.selectedAttempt) params.set("attempt", catalog.selectedAttempt);
    return `/api/academic/search?${params.toString()}`;
  }, [search, catalog.selectedLevel.code, catalog.selectedGroup, catalog.selectedAttempt]);

  useEffect(() => {
    if (!searchActive) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      try {
        const response = await fetch(searchUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Search failed");
        const payload = await response.json() as { results?: AcademicSearchResult[] };
        setResults(payload.results ?? []);
        setSearchState("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSearchState("error");
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchUrl, searchActive]);

  function updateSearch(value: string) {
    setSearch(value);
    if (value.trim().length < 2) {
      setResults([]);
      setSearchState("idle");
    }
  }

  return <div className="academic-page">
    <section className="academic-hero"><div><Badge tone="brand">Verified academic catalog</Badge><h1>CA Syllabus Explorer</h1><p>Explore the ICAI New Scheme by level, group, subject, chapter and unit. Structure is versioned so historical syllabi can remain intact.</p></div><div className="academic-source-chip"><Icon name="shield" size={18}/><span><strong>ICAI source metadata</strong><small>{catalog.sourceVerifiedAt ? `Verified ${new Date(catalog.sourceVerifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "Verification date unavailable"}</small></span></div></section>

    <nav className="academic-level-tabs" aria-label="CA level">{catalog.levels.map((level) => <Link key={level.id} href={selectionHref(catalog, { level: level.code, group: "all", attempt: null })} className={level.id === catalog.selectedLevel.id ? "is-active" : ""}>{level.name}</Link>)}</nav>

    <section className="academic-filter-row" aria-label="Syllabus filters"><div className="academic-filter-group"><span>Group</span>{catalog.groups.length > 1 ? <Link href={selectionHref(catalog, { group: "all" })} className={catalog.selectedGroup === "all" ? "is-active" : ""}>All groups</Link> : null}{catalog.groups.map((group) => <Link key={group.id} href={selectionHref(catalog, { group: group.code })} className={catalog.selectedGroup === group.code ? "is-active" : ""}>{group.name}</Link>)}</div><label className="academic-attempt-filter"><span>Attempt applicability</span><select value={catalog.selectedAttempt ?? ""} onChange={(event) => { window.location.assign(selectionHref(catalog, { attempt: event.target.value || null })); }}><option value="">Current published syllabus</option>{catalog.attempts.map((attempt) => <option key={attempt} value={attempt}>{attempt}</option>)}</select></label></section>

    <section className="academic-search" aria-label="Search syllabus"><Icon name="search" size={18}/><input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Search subject, chapter, Accounting Standard or topic" aria-label="Search academic catalog"/>{searchState === "loading" ? <span className="academic-search__status">Searching…</span> : null}</section>

    {searchActive ? <section className="academic-search-results" aria-live="polite"><div className="academic-section-heading"><div><span className="eyebrow">Search</span><h2>Matching syllabus items</h2></div><Badge tone={searchState === "error" ? "danger" : "neutral"}>{searchState === "error" ? "Search unavailable" : `${results.length} results`}</Badge></div>{searchState === "error" ? <EmptyState compact icon="shield" title="Search could not be completed" description="The catalog is still available below. Try searching again."/> : results.length ? <div className="academic-result-list">{results.map((result) => <Link key={`${result.type}-${result.id}`} href={`/subjects/${result.subjectSlug}${catalog.selectedAttempt ? `?attempt=${encodeURIComponent(catalog.selectedAttempt)}` : ""}#${result.chapterId ?? "top"}`}><span className="academic-result-type">{result.type}</span><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><Icon name="arrow" size={16}/></Link>)}</div> : searchState !== "loading" ? <EmptyState compact icon="search" title="No matching syllabus items" description="Try a broader subject, chapter or topic name."/> : null}</section> : null}

    <section className="academic-catalog-section"><div className="academic-section-heading"><div><span className="eyebrow">{catalog.selectedLevel.name}</span><h2>{catalog.selectedGroup === "all" ? "All applicable subjects" : catalog.groups.find((group) => group.code === catalog.selectedGroup)?.name ?? "Subjects"}</h2></div><Badge tone="info">{catalog.selectedAttempt ? `Attempt ${catalog.selectedAttempt}` : "Current version"}</Badge></div>{catalog.subjects.length ? <div className="academic-subject-grid">{catalog.subjects.map((subject) => <Card key={subject.id} className="academic-subject-card"><CardBody><div className="academic-subject-card__top"><span className="academic-paper-mark">{subject.paperLabel}</span><Badge tone={subject.kind === "case_study" ? "warning" : subject.kind === "combined" ? "info" : "neutral"}>{subject.kind === "case_study" ? "Case study" : subject.kind === "combined" ? "Multi-section" : "Applicable"}</Badge></div><div className="academic-subject-card__title"><h3>{subject.title}</h3><p>{subject.chapters.length} {subject.kind === "case_study" ? "academic units" : "chapters"} · {subject.version.title}</p></div><div className="academic-chapter-tree">{subject.chapters.map((chapter) => <details key={chapter.id} id={chapter.id}><summary><span className="academic-chapter-number">{chapter.number}</span><span><strong>{chapter.title}</strong>{chapter.sectionKey ? <small>{labelFromKey(chapter.sectionKey)}</small> : null}</span><Icon name="chevron" size={16}/></summary>{chapter.topics.length ? <div className="academic-topic-list">{chapter.topics.map((topic) => <div key={topic.id}><span>{topic.unitNumber ?? "•"}</span><span>{topic.title}</span>{topic.kind === "accounting_standard" ? <Badge tone="brand">AS</Badge> : null}</div>)}</div> : <p className="academic-no-topics">No separate units are represented for this chapter.</p>}</details>)}</div><div className="academic-subject-card__footer"><a href={subject.version.sourceUrl} target="_blank" rel="noreferrer">Official ICAI source <Icon name="arrow" size={14}/></a><Link href={`/subjects/${subject.slug}${catalog.selectedAttempt ? `?attempt=${encodeURIComponent(catalog.selectedAttempt)}` : ""}`}>Open subject <Icon name="arrow" size={14}/></Link></div></CardBody></Card>)}</div> : <EmptyState icon="book" title="No subjects apply to this selection" description="Choose another group or attempt. The explorer only returns subjects mapped to the selected syllabus version."/>}</section>
  </div>;
}
