"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Drawer } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";
import type { Viewer } from "@/lib/auth/server";
import { adminNavigation, studentNavigation } from "./navigation";

export function TopbarControls({ viewer, area }: { viewer: Viewer; area: "student" | "admin" }) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const accountHref = viewer.authenticated ? "/settings/profile" : `/login?next=${encodeURIComponent(pathname || "/dashboard")}`;
  const navigation = area === "admin" ? adminNavigation : studentNavigation;
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? navigation.filter((item) => `${item.label} ${item.href}`.toLowerCase().includes(normalized))
      : navigation;
    return matches.slice(0, 8);
  }, [navigation, query]);

  function closeCommand() {
    setCommandOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape" && commandOpen) closeCommand();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen]);

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      const href = results[activeIndex].href;
      closeCommand();
      router.push(href);
    }
  }

  return <>
    <div className="topbar-controls">
      <button className="command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open workspace search"><Icon name="search" size={18}/><span>Search anything</span><kbd>⌘ K</kbd></button>
      <button className="ui-icon-button notification-button" onClick={() => setNotificationsOpen(true)} aria-label="Open notifications"><Icon name="bell" size={19}/><i aria-hidden="true"/></button>
      <Link href={accountHref} className="profile-avatar" aria-label={viewer.authenticated ? "Open profile" : "Sign in"}>{viewer.initial}</Link>
    </div>
    {commandOpen ? <div className="ui-overlay command-palette-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCommand(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search CA Progress">
        <div className="command-palette__search"><Icon name="search" size={20}/><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={onSearchKeyDown} placeholder="Search pages and tools" aria-label="Search pages and tools"/><button type="button" onClick={closeCommand} aria-label="Close search">Esc</button></div>
        <div className="command-palette__meta"><span>{query ? "Search results" : "Quick navigation"}</span><small>↑↓ navigate · Enter open</small></div>
        <div className="command-palette__results" role="listbox" aria-label="Navigation results">{results.length ? results.map((item, index) => <Link key={item.href} href={item.href} role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "is-active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={closeCommand}><span className="command-palette__result-icon"><Icon name={item.icon} size={18}/></span><span><strong>{item.label}</strong><small>{item.href}</small></span><Icon name="arrow" size={16}/></Link>) : <div className="command-palette__empty"><Icon name="search"/><strong>No matching page</strong><span>Try a shorter page or feature name.</span></div>}</div>
      </section>
    </div> : null}
    <Drawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications"><EmptyState icon="bell" title="You’re all caught up" description="ICAI updates, study reminders, replies and important account alerts will appear here." action={<Button variant="secondary" onClick={() => setNotificationsOpen(false)}>Close</Button>}/></Drawer>
  </>;
}
