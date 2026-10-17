import "server-only";

import { APP_RELEASE_CONTRACT } from "@/config/app-release";
import type { StudentContextContract } from "@/lib/academic/student-context";

export const MOBILE_API_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  "X-CA-API-Version": String(APP_RELEASE_CONTRACT.api.current),
  "X-CA-Context-Version": String(APP_RELEASE_CONTRACT.academicContext.current),
  "X-CA-Web-Version": APP_RELEASE_CONTRACT.web.version,
});

export function publicStudentContext(context: StudentContextContract) {
  return {
    contractVersion: context.contractVersion,
    mode: context.mode,
    userId: context.userId,
    displayName: context.displayName,
    role: context.role,
    timezone: context.timezone,
    locale: context.locale,
    dailyTargetMinutes: context.dailyTargetMinutes,
    selection: context.selection,
    levelId: context.levelId,
    groupIds: context.groupIds,
    subjectIds: context.subjectIds,
    syllabusVersionIds: context.syllabusVersionIds,
    contextKey: context.contextKey,
    issue: context.issue,
  };
}
