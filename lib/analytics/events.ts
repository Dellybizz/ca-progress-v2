export type AnalyticsEventName = "navigation.open" | "ui.command.open" | "ui.overlay.open" | "ui.preference.preview";
export type AnalyticsEvent = { name: AnalyticsEventName; occurredAt: string; surface: string; metadata?: Record<string, string | number | boolean | null> };
export interface AnalyticsSink { capture(event: AnalyticsEvent): void | Promise<void>; }
/** Phase 1 contract only. A real analytics provider is intentionally not connected yet. */
export const noopAnalyticsSink: AnalyticsSink = { capture() { /* intentionally empty */ } };
