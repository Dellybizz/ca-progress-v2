"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";
import type { Viewer } from "@/lib/auth/server";

const quickLinks = [["Dashboard", "/dashboard"], ["Planner", "/planner"], ["Progress", "/progress"], ["Study", "/study"], ["Notes", "/notes"], ["Settings", "/settings"]];
export function TopbarControls({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false);
  const accountHref = viewer.authenticated ? "/settings/profile" : `/login?next=${encodeURIComponent(pathname || "/dashboard")}`;
  return <><div className="topbar-controls"><button className="command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open command search"><Icon name="search" size={18}/><span>Search anything</span><kbd>⌘ K</kbd></button><button className="ui-icon-button notification-button" onClick={() => setNotificationsOpen(true)} aria-label="Open notifications"><Icon name="bell" size={19}/><i aria-hidden="true"/></button><Link href={accountHref} className="profile-avatar" aria-label={viewer.authenticated ? "Open profile" : "Sign in"}>{viewer.initial}</Link></div><Modal open={commandOpen} onClose={() => setCommandOpen(false)} title="Command center"><Input autoFocus placeholder="Search pages, actions and future resources…" leading={<Icon name="search" size={17}/>} label="Search"/><div className="command-links" aria-label="Quick navigation">{quickLinks.map(([label, href]) => <Link key={href} href={href} onClick={() => setCommandOpen(false)}><span>{label}</span><Icon name="arrow" size={16}/></Link>)}</div><p className="overlay-footnote">Global data search remains assigned to a later phase.</p></Modal><Drawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications"><EmptyState icon="bell" title="Notification surface is ready" description="Real ICAI alerts, study reminders and community notifications arrive in their assigned later phases." action={<Button variant="secondary" onClick={() => setNotificationsOpen(false)}>Got it</Button>}/></Drawer></>;
}
