import "server-only";

import { cache } from "react";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { getProfileForUser, getRequestAuthContext } from "@/lib/auth/server";
import { requireAdminCapability } from "@/lib/authorization/server";
import { isCALevel, isGroupChoice, type CALevel, type GroupChoice } from "@/lib/profile/validation";

export type AcademicContextSelection = {
  level: CALevel;
  group: GroupChoice;
  attemptKey: string;
};

export type StudentContextContract = {
  mode: "guest" | "setup" | "invalid" | "ready" | "admin_preview";
  userId: string | null;
  displayName: string;
  role: string;
  entitlements: readonly string[];
  timezone: string;
  locale: "en-IN";
  selection: AcademicContextSelection | null;
  levelId: string | null;
  groupIds: readonly string[];
  subjectIds: readonly string[];
  syllabusVersionIds: readonly string[];
  contextKey: string;
  issue: string | null;
};

type ScopeRow = {
  level_id: string;
  level_code: string;
  group_id: string;
  group_code: string;
  subject_id: string;
  syllabus_version_id: string;
};

function unique(values: string[]) { return [...new Set(values)].sort(); }

function normalizeSelection(input: { level: unknown; group: unknown; attemptKey: unknown }): AcademicContextSelection | null {
  if (!isCALevel(input.level) || !isGroupChoice(input.group) || typeof input.attemptKey !== "string" || !input.attemptKey || input.attemptKey === "undecided") return null;
  if (input.level === "foundation" && input.group !== "not_applicable") return null;
  if (input.level !== "foundation" && input.group === "not_applicable") return null;
  return { level: input.level, group: input.group, attemptKey: input.attemptKey };
}

async function resolveScope(selection: AcademicContextSelection) {
  const rows = (await getD1RuntimeDatabase().prepare(`
    SELECT l.id AS level_id,l.code AS level_code,g.id AS group_id,g.code AS group_code,
      asm.subject_id,asm.syllabus_version_id
    FROM course_levels l
    JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=?1
    JOIN course_groups g ON g.id=asm.group_id
    JOIN subjects s ON s.id=asm.subject_id AND s.level_id=l.id AND s.group_id=g.id AND s.is_active=1
    JOIN syllabus_versions sv ON sv.id=asm.syllabus_version_id AND sv.subject_id=s.id
    WHERE l.code=?2 AND l.is_active=1
      AND (?3 IN ('both','not_applicable') OR g.code=?3)
    ORDER BY g.sort_order,s.sort_order
  `).bind(selection.attemptKey, selection.level, selection.group).all<ScopeRow>()).results ?? [];
  if (!rows.length) return null;
  return {
    levelId: rows[0].level_id,
    groupIds: unique(rows.map((row) => row.group_id)),
    subjectIds: unique(rows.map((row) => row.subject_id)),
    syllabusVersionIds: unique(rows.map((row) => row.syllabus_version_id)),
  };
}

export async function validateAcademicContextSelection(input: { level: unknown; group: unknown; attemptKey: unknown }) {
  const selection = normalizeSelection(input);
  if (!selection) return { ok: false as const, error: "Choose a valid level, group and decided attempt combination." };
  const scope = await resolveScope(selection);
  if (!scope) return { ok: false as const, error: "This level, group and attempt combination has no published syllabus mapping." };
  return { ok: true as const, selection, scope };
}

async function resolveStudentContextUncached(): Promise<StudentContextContract> {
  const auth = await getRequestAuthContext();
  if (!auth.identity) return {
    mode: "guest", userId: null, displayName: "Guest", role: auth.role, entitlements: [], timezone: "Asia/Kolkata", locale: "en-IN",
    selection: null, levelId: null, groupIds: [], subjectIds: [], syllabusVersionIds: [], contextKey: "guest:en-IN", issue: null,
  };
  const profile = await getProfileForUser(auth.identity.id);
  const displayName = profile?.display_name || auth.identity.displayName || auth.identity.email || "Student";
  const base = {
    userId: auth.identity.id, displayName, role: auth.role, entitlements: auth.entitlements,
    timezone: profile?.timezone || "Asia/Kolkata", locale: "en-IN" as const,
  };
  if (!profile?.onboarding_completed_at) return {
    ...base, mode: "setup", selection: null, levelId: null, groupIds: [], subjectIds: [], syllabusVersionIds: [],
    contextKey: `${auth.identity.id}:setup:${profile?.updated_at ?? "new"}`, issue: null,
  };
  const checked = await validateAcademicContextSelection({ level: profile.ca_level, group: profile.group_choice, attemptKey: profile.attempt_key });
  if (!checked.ok) return {
    ...base, mode: "invalid", selection: null, levelId: null, groupIds: [], subjectIds: [], syllabusVersionIds: [],
    contextKey: `${auth.identity.id}:invalid:${profile.updated_at}`, issue: checked.error,
  };
  return {
    ...base, mode: "ready", selection: checked.selection, ...checked.scope,
    contextKey: `${auth.identity.id}:${profile.updated_at}:${checked.selection.level}:${checked.selection.group}:${checked.selection.attemptKey}`,
    issue: null,
  };
}

/** The sole request-scoped identity + academic-context resolver for student routes. */
export const getStudentContext = cache(resolveStudentContextUncached);

/** Builds a non-persistent academic context for authorized admin previews. */
export async function getAdminPreviewContext(input: { level: unknown; group: unknown; attemptKey: unknown }): Promise<StudentContextContract> {
  const actor = await requireAdminCapability("academic.read");
  const checked = await validateAcademicContextSelection(input);
  if (!checked.ok) throw new Error(checked.error);
  return {
    mode: "admin_preview", userId: null, displayName: "Admin preview", role: actor.role, entitlements: [], timezone: "Asia/Kolkata", locale: "en-IN",
    selection: checked.selection, ...checked.scope,
    contextKey: `preview:${checked.selection.level}:${checked.selection.group}:${checked.selection.attemptKey}`,
    issue: null,
  };
}

export function academicFeatureCacheKey(context: Pick<StudentContextContract, "contextKey">, feature: string) {
  return `${context.contextKey}:${feature}`;
}
