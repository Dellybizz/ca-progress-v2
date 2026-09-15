"use client";

import { createContext, createElement, useContext } from "react";

export type ViewerSnapshot = { authenticated: boolean; label: string; initial: string; avatarUrl?: string | null; role?: string };

const ViewerContext = createContext<ViewerSnapshot | null>(null);
export function ViewerProvider({ viewer, children }: { viewer: ViewerSnapshot; children: React.ReactNode }) { return createElement(ViewerContext.Provider, { value: viewer }, children); }
export function useViewer() { const viewer = useContext(ViewerContext); if (!viewer) throw new Error("useViewer must be used inside the application shell."); return viewer; }
