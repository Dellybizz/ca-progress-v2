"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";

type TrailItem = { href: string; label: string };
const STORAGE_KEY = "ca-progress:route-trail:v1";
const LABELS: Record<string, string> = {
  dashboard: "Dashboard", study: "Study", syllabus: "Syllabus", subjects: "Subjects",
  chapters: "Chapters", planner: "Planner", today: "Today", progress: "Progress",
  tests: "Tests", knowledge: "Knowledge", people: "People", account: "Account",
  settings: "Settings", profile: "Profile", community: "Community", admin: "Operations",
  "study-buddy": "Study buddy", billing: "Billing", resources: "Resources", notes: "Notes",
};

function routeLabel(pathname: string) {
  if (pathname === "/") return "Home";
  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "Home";
  if (LABELS[segment]) return LABELS[segment];
  if (/^[0-9a-f-]{16,}$/i.test(segment)) return "Details";
  return decodeURIComponent(segment).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readTrail(): TrailItem[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is TrailItem => Boolean(item && typeof item === "object" && "href" in item && "label" in item)).slice(-5) : [];
  } catch { return []; }
}

export function RouteTrail({ homeHref }: { homeHref: string }) {
  const pathname = usePathname();
  const current = useMemo(() => ({ href: pathname, label: routeLabel(pathname) }), [pathname]);
  const [items, setItems] = useState<TrailItem[]>([current]);

  useEffect(() => {
    const previous = readTrail();
    const existing = previous.findIndex((item) => item.href === pathname);
    const next = existing >= 0 ? previous.slice(0, existing + 1) : [...previous, current].slice(-5);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const update = window.setTimeout(() => setItems(next), 0);
    return () => window.clearTimeout(update);
  }, [current, pathname]);

  if (pathname === homeHref || pathname === "/") return null;
  const visible = items.length > 1 ? items : [{ href: homeHref, label: homeHref === "/admin" ? "Operations" : "Dashboard" }, current];
  return <nav className="route-trail" aria-label="Page path"><ol>{visible.map((item, index) => <li key={`${item.href}-${index}`}>
    {index ? <Icon name="chevron" size={12}/> : null}
    {index === visible.length - 1 ? <span aria-current="page">{item.label}</span> : <Link href={item.href}>{item.label}</Link>}
  </li>)}</ol></nav>;
}
