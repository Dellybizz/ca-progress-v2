export type MobileOfflinePolicy = "full" | "partial" | "snapshot" | "online";
export type MobileFeatureParity = {
  id: string;
  label: string;
  href: string;
  mobileLayout: string;
  offline: MobileOfflinePolicy;
  permission: "guest" | "account";
  synchronization: string;
  failureState: string;
  analytics: string;
};

const FEATURES: readonly Omit<MobileFeatureParity, "analytics">[] = [
  {
    id: "dashboard",
    label: "Dashboard & countdown",
    href: "/dashboard",
    mobileLayout: "single-column priority stream",
    offline: "snapshot",
    permission: "guest",
    synchronization: "server model on navigation",
    failureState: "route error and independent optional widgets",
  },
  {
    id: "today",
    label: "Today",
    href: "/planner/today",
    mobileLayout: "touch-first ordered agenda",
    offline: "online",
    permission: "guest",
    synchronization: "v1 planner contract",
    failureState: "empty and route error states",
  },
  {
    id: "progress",
    label: "Progress & syllabus",
    href: "/progress",
    mobileLayout: "compact subject and chapter drill-down",
    offline: "full",
    permission: "guest",
    synchronization: "idempotent ordered chapter edits",
    failureState: "stale snapshot and conflict recovery",
  },
  {
    id: "chapter-hub",
    label: "Chapter Hub",
    href: "/syllabus",
    mobileLayout: "shallow chapter workspace",
    offline: "snapshot",
    permission: "account",
    synchronization: "shared chapter services",
    failureState: "not-found and route error states",
  },
  {
    id: "focus",
    label: "Focus & session review",
    href: "/study",
    mobileLayout: "mobile timer workspace",
    offline: "full",
    permission: "guest",
    synchronization: "ordered timer actions",
    failureState: "recoverable timer and reflection states",
  },
  {
    id: "planning",
    label: "Planner, goals, revision & tests",
    href: "/planner",
    mobileLayout: "agenda cards and compact forms",
    offline: "partial",
    permission: "account",
    synchronization: "v1 planner mutations",
    failureState: "per-route loading, empty and errors",
  },
  {
    id: "notes",
    label: "Notes",
    href: "/notes",
    mobileLayout: "mobile editor and library",
    offline: "full",
    permission: "account",
    synchronization: "sanitized idempotent note edits",
    failureState: "local draft retention and route errors",
  },
  {
    id: "activity",
    label: "Activity",
    href: "/activity",
    mobileLayout: "timeline with isolated gamification",
    offline: "online",
    permission: "account",
    synchronization: "server-derived activity stream",
    failureState: "timeline survives optional XP failure",
  },
  {
    id: "search",
    label: "Global search",
    href: "/syllabus",
    mobileLayout: "full-screen command dialog",
    offline: "online",
    permission: "guest",
    synchronization: "v1 academic search",
    failureState: "navigation remains available when search fails",
  },
  {
    id: "attempts-settings",
    label: "Attempts & settings",
    href: "/settings",
    mobileLayout: "stacked settings sections",
    offline: "online",
    permission: "account",
    synchronization: "server profile and device preferences",
    failureState: "validated forms and route errors",
  },
  {
    id: "profile-xp",
    label: "Profile, XP & leaderboards",
    href: "/activity#leaderboard",
    mobileLayout: "private profile and responsive rankings",
    offline: "online",
    permission: "account",
    synchronization: "server-owned XP and opt-in rankings",
    failureState: "gamification cannot block activity",
  },
  {
    id: "study-buddy",
    label: "Study Buddy",
    href: "/study-buddy",
    mobileLayout: "relationship cards and comparison stack",
    offline: "online",
    permission: "account",
    synchronization: "owner-authorized relationship service",
    failureState: "login and empty relationship states",
  },
  {
    id: "notifications",
    label: "Notifications",
    href: "/planner",
    mobileLayout: "app-bar notification drawer",
    offline: "online",
    permission: "account",
    synchronization: "v1 notification center",
    failureState: "loading, empty and retry states",
  },
  {
    id: "feature-tour",
    label: "Feature Tour",
    href: "/feature-tour",
    mobileLayout: "one-step-at-a-time walkthrough",
    offline: "snapshot",
    permission: "guest",
    synchronization: "cross-device account progress",
    failureState: "local progress remains if saving fails",
  },
] as const;

export const MOBILE_STUDENT_FEATURES: readonly MobileFeatureParity[] =
  FEATURES.map((feature) => ({
    ...feature,
    analytics: "shared route, API and failure telemetry",
  }));
