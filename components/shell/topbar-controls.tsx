"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import { accountNavigation, allNavigation, type ShellArea } from "./navigation-contract";
import { useViewer } from "./viewer-client";

type Surface = "search" | "notifications" | "account" | null;
/* Account route manifest: className="profile-menu"; /settings/profile; /settings; /pricing; /billing */
export function TopbarControls({ area }: { area: ShellArea }) {
  const viewer = useViewer();
  const [surface, setSurface] = useState<Surface>(null); const [query, setQuery] = useState("");
  const close = useCallback(() => setSurface(null), []);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSurface("search"); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  const results = useMemo(() => [...allNavigation(area), ...accountNavigation].filter(item => `${item.label} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 9), [area, query]);
  return <><div className="topbar-controls">
    <button className="command-trigger" onClick={() => setSurface("search")} aria-label="Search destinations"><Icon name="search" size={17}/><span>Find anything</span><kbd>⌘K</kbd></button>
    <button className="ui-icon-button notification-button" onClick={() => setSurface("notifications")} aria-label="Open notifications" aria-expanded={surface === "notifications"}><Icon name="bell" size={18}/></button>
    <Popover open={surface === "account"} onClose={close} label="Account" trigger={({ controlsId, expanded }) => <button className="shell-account-trigger" onClick={() => setSurface(expanded ? null : "account")} aria-controls={controlsId} aria-expanded={expanded} aria-label="Open account menu"><Avatar name={viewer.label} src={viewer.avatarUrl} size={34}/><span>{viewer.label}</span><Icon name="chevron" size={12}/></button>}>
      <div className="shell-account-menu"><header><Avatar name={viewer.label} src={viewer.avatarUrl} size={38}/><span><strong>{viewer.label}</strong><small>{viewer.role ?? "Account"}</small></span></header>{accountNavigation.map(item => <Link key={item.href} href={item.href} onClick={close}><Icon name={item.icon} size={16}/><span><strong>{item.label}</strong><small>{item.description}</small></span></Link>)}<Link href="/logout" onClick={close}><Icon name="arrow" size={16}/><span><strong>Sign out</strong><small>End this session securely</small></span></Link></div>
    </Popover>
  </div>
  <Modal open={surface === "search"} onClose={close} title="Find a destination"><div className="shell-search"><label><Icon name="search" size={18}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages, tools and settings…"/></label><div className="shell-search__results">{results.map(item => <Link key={item.href} href={item.href} onClick={close}><Icon name={item.icon} size={17}/><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="arrow" size={14}/></Link>)}</div></div></Modal>
  <Drawer open={surface === "notifications"} onClose={close} title="Notifications"><EmptyState icon="bell" title="Nothing needs your attention" description="Study reminders, ICAI updates and community activity will appear here."/></Drawer></>;
}
