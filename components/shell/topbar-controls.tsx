"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";

type Viewer = { authenticated: boolean; label: string; initial: string };

const guestViewer: Viewer = { authenticated: false, label: "Guest", initial: "G" };

const quickLinks = [
  ["Dashboard", "/dashboard"],
  ["Study", "/study"],
  ["Progress", "/progress"],
  ["Resources", "/resources"],
  ["Community", "/community"],
];

const accountLinks = [
  ["Profile", "/settings/profile"],
  ["Settings", "/settings"],
  ["Pricing", "/pricing"],
  ["Billing", "/billing"],
];

export function TopbarControls({ viewer: initialViewer = guestViewer }: { viewer?: Viewer }) {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer>(initialViewer);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const loginHref = `/login?next=${encodeURIComponent(pathname || "/dashboard")}`;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/viewer", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Viewer> : null)
      .then((nextViewer) => {
        if (!cancelled && nextViewer) {
          setViewer(nextViewer);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="topbar-controls">
        <button className="command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open search">
          <Icon name="search" size={18}/><span>Search</span><kbd>⌘ K</kbd>
        </button>
        <button className="ui-icon-button notification-button" onClick={() => setNotificationsOpen(true)} aria-label="Open notifications">
          <Icon name="bell" size={19}/><i aria-hidden="true"/></button>
        {viewer.authenticated ? (
          <details className="profile-menu">
            <summary className="profile-avatar" aria-label="Open account menu">{viewer.initial}</summary>
            <div className="profile-menu__panel" role="menu">
              <div className="profile-menu__identity"><strong>{viewer.label}</strong><span>Account</span></div>
              <div className="profile-menu__links">
                {accountLinks.map(([label, href]) => (
                  <Link prefetch={true} key={href} href={href} role="menuitem"><span>{label}</span><Icon name="chevron" size={14}/></Link>
                ))}
              </div>
            </div>
          </details>
        ) : (
          <Link prefetch={true} href={loginHref} className="profile-avatar" aria-label="Sign in">{viewer.initial}</Link>
        )}
      </div>

      <Modal open={commandOpen} onClose={() => setCommandOpen(false)} title="Search CA Progress">
        <Input autoFocus placeholder="Search pages and tools…" leading={<Icon name="search" size={17}/>} label="Search"/>
        <div className="command-links" aria-label="Quick navigation">
          {quickLinks.map(([label, href]) => <Link prefetch={true} key={href} href={href} onClick={() => setCommandOpen(false)}><span>{label}</span><Icon name="arrow" size={16}/></Link>)}
        </div>
      </Modal>

      <Drawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications">
        <EmptyState
          icon="bell"
          title="You’re all caught up"
          description="Study reminders, ICAI updates and community activity will appear here when available."
          action={<Button variant="secondary" onClick={() => setNotificationsOpen(false)}>Done</Button>}
        />
      </Drawer>
    </>
  );
}
