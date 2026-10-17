"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";
import type { PlannerNotification } from "@/lib/planner/types";

type State = {
  status: "idle" | "loading" | "ready" | "error";
  items: PlannerNotification[];
  error?: string;
};
export function NotificationDrawer({
  open,
  onClose,
  authenticated,
}: {
  open: boolean;
  onClose: () => void;
  authenticated: boolean;
}) {
  const [state, setState] = useState<State>({ status: "idle", items: [] });
  useEffect(() => {
    if (!open || !authenticated) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => setState((current) => ({ ...current, status: "loading" })),
      0,
    );
    fetch("/api/v1/planner/notifications", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          notifications?: PlannerNotification[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? "Notifications could not be loaded.");
        return data.notifications ?? [];
      })
      .then((items) => setState({ status: "ready", items }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            items: [],
            error:
              error instanceof Error
                ? error.message
                : "Notifications could not be loaded.",
          });
      });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, authenticated]);
  async function markRead(item: PlannerNotification) {
    if (item.readAt) return;
    setState((current) => ({
      ...current,
      items: current.items.map((value) =>
        value.id === item.id
          ? { ...value, readAt: new Date().toISOString() }
          : value,
      ),
    }));
    await fetch("/api/v1/planner/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id: item.id }),
    }).catch(() => undefined);
  }
  return (
    <Drawer open={open} onClose={onClose} title="Notifications">
      {!authenticated ? (
        <EmptyState
          icon="lock"
          title="Sign in for private reminders"
          description="Planner, revision, goal and doubt notifications are tied to your account."
          action={
            <Link
              className="ui-button ui-button--primary"
              href="/login?next=%2Fdashboard"
            >
              Sign in
            </Link>
          }
        />
      ) : null}
      {authenticated && state.status === "loading" ? (
        <div className="shell-notification-state" aria-busy="true">
          Loading notifications…
        </div>
      ) : null}
      {authenticated && state.status === "error" ? (
        <div className="shell-notification-state" role="alert">
          <strong>Notifications could not load</strong>
          <p>{state.error}</p>
        </div>
      ) : null}
      {authenticated && state.status === "ready" && !state.items.length ? (
        <EmptyState
          icon="bell"
          title="Nothing needs your attention"
          description="Study reminders, goals and answered doubts will appear here."
        />
      ) : null}
      {authenticated && state.items.length ? (
        <div className="shell-notification-list">
          {state.items.map((item) => (
            <Link
              key={item.id}
              href={item.actionHref}
              className={item.readAt ? "" : "is-unread"}
              onClick={() => {
                void markRead(item);
                onClose();
              }}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <time>{new Date(item.createdAt).toLocaleString()}</time>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </Drawer>
  );
}
