"use client";

import { useSyncExternalStore } from "react";

export type ViewerSnapshot = { authenticated: boolean; label: string; initial: string };

const guestViewer: ViewerSnapshot = { authenticated: false, label: "Guest", initial: "G" };
let snapshot = guestViewer;
let started = false;
const listeners = new Set<() => void>();

function startViewerRequest() {
  if (started) return;
  started = true;
  void fetch("/api/auth/viewer", { cache: "no-store" })
    .then((response) => response.ok ? response.json() as Promise<ViewerSnapshot> : null)
    .then((nextViewer) => {
      if (!nextViewer) return;
      snapshot = nextViewer;
      listeners.forEach((listener) => listener());
    })
    .catch(() => undefined);
}

function subscribe(listener: () => void) {
  startViewerRequest();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useViewer() {
  return useSyncExternalStore(subscribe, getSnapshot, () => guestViewer);
}
