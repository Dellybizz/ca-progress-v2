import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep one Next.js codebase while compiling independent server bundles for the
// domains that are expected to grow. The public ingress Worker only owns
// middleware/routing and forwards SSR/API requests to these private workers.
//
// This keeps future feature growth out of a single 3 MiB Free-plan Worker.
const cloudflare = defineCloudflareConfig();

export default {
  ...cloudflare,
  functions: {
    admin: {
      routes: [
        "app/(admin)/admin/page",
        "app/(admin)/admin/audit/page",
        "app/(admin)/admin/community/moderation/page",
        "app/(admin)/admin/content/page",
        "app/(admin)/admin/icai-sync/page",
        "app/(admin)/admin/members/page",
        "app/(admin)/admin/notifications/page",
        "app/(admin)/admin/plans/page",
        "app/(admin)/admin/platform/page",
        "app/(admin)/admin/resources/moderation/page",
        "app/(admin)/admin/syllabus/page",
        "app/api/admin/audit/route",
        "app/api/admin/community/moderation/route",
        "app/api/admin/content/route",
        "app/api/admin/health/route",
        "app/api/admin/members/route",
        "app/api/admin/notifications/route",
        "app/api/admin/plans/route",
        "app/api/admin/platform/route",
        "app/api/admin/resources/moderation/route",
      ],
      patterns: ["admin", "admin/*", "api/admin/*"],
    },
    community: {
      routes: [
        "app/(student)/community/page",
        "app/(student)/community/[channel]/page",
        "app/(student)/notes/page",
        "app/(student)/notes/[id]/page",
        "app/(student)/resources/page",
        "app/(student)/resources/[id]/page",
        "app/(student)/resources/icai/page",
        "app/(student)/updates/page",
        "app/api/community/channels/[channel]/messages/route",
        "app/api/community/channels/[channel]/read/route",
        "app/api/community/messages/[id]/reaction/route",
        "app/api/community/messages/[id]/report/route",
        "app/api/notes/route",
        "app/api/notes/[id]/route",
        "app/api/resources/[id]/route",
        "app/api/resources/[id]/access/route",
        "app/api/resources/report/route",
        "app/api/resources/upload/route",
      ],
      patterns: ["community", "community/*", "notes", "notes/*", "resources", "resources/*", "updates", "api/community/*", "api/notes/*", "api/resources/*"],
    },
    planning: {
      routes: [
        "app/(student)/activity/page",
        "app/(student)/analytics/page",
        "app/(student)/analytics/forecast/page",
        "app/(student)/calendar/page",
        "app/(student)/goals/page",
        "app/(student)/planner/page",
        "app/(student)/planner/revision-settings/page",
        "app/(student)/planner/today/page",
        "app/(student)/progress/page",
        "app/(student)/study/page",
        "app/(student)/subjects/[subjectSlug]/page",
        "app/(student)/subjects/[subjectSlug]/progress/page",
        "app/api/planner/calendar/route",
        "app/api/planner/goals/route",
        "app/api/planner/revision-settings/route",
        "app/api/planner/tasks/route",
        "app/api/planner/today/route",
        "app/api/progress/route",
        "app/api/study/timer/route",
        "app/api/study/timezone/route",
      ],
      patterns: ["activity", "analytics", "analytics/*", "calendar", "goals", "planner", "planner/*", "progress", "progress/*", "study", "study/*", "subjects/*", "api/planner/*", "api/progress", "api/study/*"],
    },
  },
};
