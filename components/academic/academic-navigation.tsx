"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";

export type AcademicCrumb = { label: string; href?: string };

export function AcademicBreadcrumbs({ items }: { items: AcademicCrumb[] }) {
  const params = useSearchParams();
  const via = params.get("via");
  let trail = items;
  if (via === "study" && !items.some((item) => item.label === "Study")) trail = [{ label: "Dashboard", href: "/dashboard" }, { label: "Study", href: "/study" }, ...items.filter((item) => item.label !== "Dashboard")];
  if (via === "subject" && items[1]) trail = [{ label: "Dashboard", href: "/dashboard" }, { label: "Syllabus", href: "/syllabus" }, ...items.slice(1)];
  return <nav className="academic-breadcrumbs" aria-label="Breadcrumb"><ol>{trail.map((item, index) => <li key={`${item.label}-${index}`}>
    {index ? <Icon name="chevron" size={12}/> : null}
    {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
  </li>)}</ol></nav>;
}

export function AcademicContextBar({ level, group, attempt, syllabus }: { level: string; group?: string | null; attempt?: string | null; syllabus?: string | null }) {
  const items = [{ label: "Level", value: level }, group && group !== "all" ? { label: "Group", value: group } : null, { label: "Attempt", value: attempt || "Current" }, syllabus ? { label: "Syllabus", value: syllabus } : null].filter((item): item is { label: string; value: string } => Boolean(item));
  return <section className="academic-context-bar" aria-label="Current academic context"><Icon name="layers" size={18}/><div>{items.map((item) => <span key={item.label}><small>{item.label}</small><strong>{item.value}</strong></span>)}</div></section>;
}

export function AcademicEntityMark({ label, kind = "subject" }: { label: string; kind?: "subject" | "chapter" | "resource" }) {
  return <span className={`academic-entity-mark academic-entity-mark--${kind}`} aria-hidden="true"><Icon name={kind === "resource" ? "notes" : kind === "chapter" ? "book" : "layers"} size={17}/><small>{label}</small></span>;
}

export type AcademicContentState = "Current" | "Historical" | "New" | "Changed" | "Unavailable";

export function AcademicStateBadge({ state }: { state: AcademicContentState }) {
  const tone = state === "Current" ? "success" : state === "New" ? "info" : state === "Changed" ? "warning" : state === "Unavailable" ? "danger" : "neutral";
  return <Badge tone={tone}>{state}</Badge>;
}
