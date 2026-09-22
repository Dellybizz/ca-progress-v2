"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/overlay";
import { Popover } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import {
  accountNavigation,
  allNavigation,
  type ShellArea,
} from "./navigation-contract";
import { useViewer } from "./viewer-client";
import { loginPathFor } from "@/lib/auth/navigation";
import { NotificationDrawer } from "./notification-drawer";
import type { AcademicSearchResult } from "@/lib/academic/types";

type Surface = "search" | "notifications" | "account" | null;
/* Account route manifest: className="profile-menu"; /settings/profile; /settings; /pricing; /billing */
export function TopbarControls({ area }: { area: ShellArea }) {
  const viewer = useViewer();
  const pathname = usePathname();
  const loginHref = loginPathFor(pathname || "/planner/today");
  const [surface, setSurface] = useState<Surface>(null);
  const [query, setQuery] = useState("");
  const [academic, setAcademic] = useState<AcademicSearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const close = useCallback(() => setSurface(null), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSurface("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const results = useMemo(
    () =>
      [...allNavigation(area), ...accountNavigation]
        .filter((item) =>
          `${item.label} ${item.description}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 9),
    [area, query],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (
        surface !== "search" ||
        area !== "student" ||
        query.trim().length < 2
      ) {
        setAcademic([]);
        setSearchState("idle");
        return;
      }
      setSearchState("loading");
      try {
        const response = await fetch(
          `/api/v1/academic/search?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as {
          results?: AcademicSearchResult[];
        };
        if (!response.ok) throw new Error();
        setAcademic(payload.results ?? []);
        setSearchState("idle");
      } catch {
        if (!controller.signal.aborted) setSearchState("error");
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [area, query, surface]);
  const academicHref = (item: AcademicSearchResult) =>
    item.type === "subject"
      ? `/subjects/${item.subjectSlug}`
      : item.chapterId
        ? `/chapters/${item.chapterId}`
        : `/subjects/${item.subjectSlug}`;
  return (
    <>
      <div className="topbar-controls">
        <button
          className="command-trigger"
          onClick={() => setSurface("search")}
          aria-label="Search destinations"
        >
          <Icon name="search" size={17} />
          <span>Find anything</span>
          <kbd>⌘K</kbd>
        </button>
        <button
          className="ui-icon-button notification-button"
          onClick={() => setSurface("notifications")}
          aria-label="Open notifications"
          aria-expanded={surface === "notifications"}
        >
          <Icon name="bell" size={18} />
        </button>
        {viewer.authenticated ? (
          <Popover
            open={surface === "account"}
            onClose={close}
            label="Account"
            trigger={({ controlsId, expanded }) => (
              <button
                className="shell-account-trigger"
                onClick={() => setSurface(expanded ? null : "account")}
                aria-controls={controlsId}
                aria-expanded={expanded}
                aria-label="Open account menu"
              >
                <Avatar name={viewer.label} src={viewer.avatarUrl} size={34} />
                <span>{viewer.label}</span>
                <Icon name="chevron" size={12} />
              </button>
            )}
          >
            <div className="shell-account-menu">
              <header>
                <Avatar name={viewer.label} src={viewer.avatarUrl} size={38} />
                <span>
                  <strong>{viewer.label}</strong>
                  <small>{viewer.role ?? "Account"}</small>
                </span>
              </header>
              {accountNavigation.map((item) => (
                <Link key={item.href} href={item.href} onClick={close}>
                  <Icon name={item.icon} size={16} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </Link>
              ))}
              <Link href="/logout" onClick={close}>
                <Icon name="arrow" size={16} />
                <span>
                  <strong>Sign out</strong>
                  <small>End this session securely</small>
                </span>
              </Link>
            </div>
          </Popover>
        ) : (
          <Link className="ui-button ui-button--primary" href={loginHref}>
            <Icon name="lock" size={16} />
            <span>Sign in</span>
          </Link>
        )}
      </div>
      <Modal open={surface === "search"} onClose={close} title="Find anything">
        <div className="shell-search">
          <label>
            <Icon name="search" size={18} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, subjects, chapters and topics…"
            />
          </label>
          <div className="shell-search__results">
            {results.map((item) => (
              <Link key={item.href} href={item.href} onClick={close}>
                <Icon name={item.icon} size={17} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <Icon name="arrow" size={14} />
              </Link>
            ))}
            {academic.map((item) => (
              <Link
                key={`${item.type}:${item.id}`}
                href={academicHref(item)}
                onClick={close}
              >
                <Icon
                  name={item.type === "subject" ? "book" : "layers"}
                  size={17}
                />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <Icon name="arrow" size={14} />
              </Link>
            ))}
            {searchState === "loading" ? (
              <p className="shell-search__status">
                Searching your academic workspace…
              </p>
            ) : null}
            {searchState === "error" ? (
              <p className="shell-search__status" role="alert">
                Academic search is unavailable. Page shortcuts still work.
              </p>
            ) : null}
          </div>
        </div>
      </Modal>
      <NotificationDrawer
        open={surface === "notifications"}
        onClose={close}
        authenticated={viewer.authenticated}
      />
    </>
  );
}
