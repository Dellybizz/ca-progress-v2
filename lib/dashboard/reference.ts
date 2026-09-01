import "server-only";

import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createD1AdminCompatClient } from "@/lib/data/d1/supabase-compat";
import { getSupabasePublicConfig } from "@/lib/env";
import { isCloudflareDataRuntime } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { DashboardAcademicReference, DashboardAcademicSubject, DashboardIcaiUpdate, DashboardLiveReference } from "./types";

type GroupRow = Database["public"]["Tables"]["course_groups"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type AttemptMapRow = Database["public"]["Tables"]["attempt_syllabus_map"]["Row"];
type ChapterRow = Database["public"]["Tables"]["chapters"]["Row"];
type ResourceRow = Database["public"]["Tables"]["icai_resources"]["Row"];
type SourceRow = Database["public"]["Tables"]["icai_sources"]["Row"];
type ResourceAttemptRow = Database["public"]["Tables"]["resource_attempt_map"]["Row"];
type ResourceSubjectRow = Database["public"]["Tables"]["resource_subject_map"]["Row"];

function createReferenceClient(): SupabaseClient<Database> {
  if (isCloudflareDataRuntime()) return createD1AdminCompatClient() as unknown as SupabaseClient<Database>;
  const config = getSupabasePublicConfig();
  if (!config.configured) throw new Error("V2 Supabase public configuration is missing.");
  return createClient<Database>(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function jsonRecord(value: Json): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function unique<T>(values: T[]) { return [...new Set(values)]; }

async function loadAcademicReference(levelCode: string, groupChoice: string, attemptKey: string): Promise<DashboardAcademicReference | null> {
  const supabase = createReferenceClient();
  const levelResponse = await supabase.from("course_levels").select("*").eq("code", levelCode).eq("is_active", true).maybeSingle();
  if (levelResponse.error) throw levelResponse.error;
  const level = levelResponse.data;
  if (!level) return null;
  const [groupResponse, subjectResponse, mapResponse] = await Promise.all([
    supabase.from("course_groups").select("*").eq("level_id", level.id).eq("is_active", true).order("sort_order"),
    supabase.from("subjects").select("*").eq("level_id", level.id).eq("is_active", true).order("sort_order"),
    supabase.from("attempt_syllabus_map").select("*").eq("level_id", level.id).eq("attempt_key", attemptKey),
  ]);
  const firstError = [groupResponse.error, subjectResponse.error, mapResponse.error].find(Boolean);
  if (firstError) throw firstError;
  const groups = (groupResponse.data ?? []) as GroupRow[];
  const subjects = (subjectResponse.data ?? []) as SubjectRow[];
  const maps = (mapResponse.data ?? []) as AttemptMapRow[];
  const aggregateGroups = levelCode === "foundation" || groupChoice === "both" || groupChoice === "not_applicable";
  const allowedGroups = new Set((aggregateGroups ? groups : groups.filter((group) => group.code === groupChoice)).map((group) => group.id));
  const applicableMaps = maps.filter((row) => allowedGroups.has(row.group_id));
  const subjectIds = new Set(applicableMaps.map((row) => row.subject_id));
  const versionIds = unique(applicableMaps.map((row) => row.syllabus_version_id));
  let chapters: ChapterRow[] = [];
  if (versionIds.length) {
    const chapterResponse = await supabase.from("chapters").select("*").in("syllabus_version_id", versionIds).order("sort_order");
    if (chapterResponse.error) throw chapterResponse.error;
    chapters = (chapterResponse.data ?? []) as ChapterRow[];
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const versionBySubject = new Map(applicableMaps.map((row) => [row.subject_id, row.syllabus_version_id]));
  const academicSubjects: DashboardAcademicSubject[] = subjects.filter((subject) => allowedGroups.has(subject.group_id) && subjectIds.has(subject.id)).map((subject) => {
    const versionId = versionBySubject.get(subject.id); const group = groupById.get(subject.group_id);
    return { id: subject.id, title: subject.title, slug: subject.slug, groupCode: group?.code ?? "all", groupName: group?.name ?? "All Papers", chapterCount: versionId ? chapters.filter((chapter) => chapter.syllabus_version_id === versionId).length : 0 };
  });
  return { level: { id: level.id, code: level.code, name: level.name }, groups: groups.filter((group) => aggregateGroups || allowedGroups.has(group.id)).map((group) => ({ id: group.id, code: group.code, name: group.name })), subjects: academicSubjects, totalChapters: academicSubjects.reduce((sum, subject) => sum + subject.chapterCount, 0) };
}

const cachedAcademicReference = unstable_cache(loadAcademicReference,["phase4-dashboard-academic-v1"],{ revalidate: 900 });

async function loadLiveReference(levelId: string, levelCode: string, attemptKey: string, subjectIdsKey: string, today: string): Promise<DashboardLiveReference> {
  const supabase = createReferenceClient();
  const subjectIds = subjectIdsKey ? subjectIdsKey.split(",").filter(Boolean) : [];
  const attemptResponse = await supabase.from("exam_attempts").select("*").eq("level_id", levelId).eq("attempt_key", attemptKey).eq("verification_status", "verified").maybeSingle();
  if (attemptResponse.error) throw attemptResponse.error;
  const attempt = attemptResponse.data;
  const [eventResponse, resourceResponse, sourceResponse, attemptMapResponse, subjectMapResponse] = await Promise.all([
    attempt ? supabase.from("exam_events").select("*").eq("attempt_id", attempt.id).eq("verification_status", "verified").gte("event_date", today).order("event_date").limit(24) : Promise.resolve({ data: [], error: null }),
    supabase.from("icai_resources").select("*").eq("verification_status", "verified").eq("status", "active").order("last_changed_at", { ascending: false }).limit(120),
    supabase.from("icai_sources").select("*").eq("is_active", true),
    supabase.from("resource_attempt_map").select("*"),
    supabase.from("resource_subject_map").select("*"),
  ]);
  const firstError = [eventResponse.error, resourceResponse.error, sourceResponse.error, attemptMapResponse.error, subjectMapResponse.error].find(Boolean);
  if (firstError) throw firstError;
  const sourceById = new Map(((sourceResponse.data ?? []) as SourceRow[]).map((source) => [source.id, source]));
  const attemptIdsByResource = new Map<string, string[]>();
  for (const row of (attemptMapResponse.data ?? []) as ResourceAttemptRow[]) attemptIdsByResource.set(row.resource_id, [...(attemptIdsByResource.get(row.resource_id) ?? []), row.attempt_id]);
  const subjectIdsByResource = new Map<string, string[]>();
  for (const row of (subjectMapResponse.data ?? []) as ResourceSubjectRow[]) subjectIdsByResource.set(row.resource_id, [...(subjectIdsByResource.get(row.resource_id) ?? []), row.subject_id]);
  const selectedSubjectIds = new Set(subjectIds);
  const updates: DashboardIcaiUpdate[] = ((resourceResponse.data ?? []) as ResourceRow[]).filter((resource) => {
    const mappedAttempts = attemptIdsByResource.get(resource.id) ?? []; const mappedSubjects = subjectIdsByResource.get(resource.id) ?? []; const metadata = jsonRecord(resource.metadata);
    const metadataLevels = Array.isArray(metadata.level_codes) ? metadata.level_codes.filter((value): value is string => typeof value === "string") : [];
    const attemptMatch = Boolean(attempt && mappedAttempts.includes(attempt.id)); const subjectMatch = mappedSubjects.some((id) => selectedSubjectIds.has(id));
    if (mappedAttempts.length && !attemptMatch) return false; if (mappedSubjects.length && !subjectMatch) return false; return metadataLevels.includes(levelCode) || attemptMatch || subjectMatch;
  }).slice(0,4).map((resource) => { const source = sourceById.get(resource.source_id); return { id:resource.id,type:resource.resource_type,title:resource.title,summary:resource.summary,officialUrl:resource.official_url,sourceName:source?.name??"ICAI",sourceUrl:source?.official_url??resource.official_url,publishedOn:resource.published_on,lastVerifiedAt:resource.last_seen_at,lastChangedAt:resource.last_changed_at }; });
  const examEvents = (eventResponse.data ?? []).filter((event) => event.event_type === "exam_start" || event.event_type === "exam_paper").map((event) => ({ id:event.id,title:event.title,eventType:event.event_type,eventDate:event.event_date,sourceUrl:event.source_url,lastVerifiedAt:event.last_seen_at }));
  const verifiedCandidates = [attempt?.last_seen_at ?? null,...examEvents.map((event)=>event.lastVerifiedAt),...updates.map((update)=>update.lastVerifiedAt)].filter((value): value is string => Boolean(value));
  return { attempt: attempt ? { id:attempt.id,key:attempt.attempt_key,label:attempt.label,startDate:attempt.start_date,endDate:attempt.end_date,sourceUrl:attempt.source_url,lastVerifiedAt:attempt.last_seen_at } : null, examEvents, updates, verifiedAt:verifiedCandidates.sort().at(-1)??null };
}

const cachedLiveReference = unstable_cache(loadLiveReference,["phase4-dashboard-live-v1"],{ revalidate: 60 });
export function getDashboardAcademicReference(levelCode:string,groupChoice:string,attemptKey:string){return cachedAcademicReference(levelCode,groupChoice,attemptKey);}
export function getDashboardLiveReference(input:{levelId:string;levelCode:string;attemptKey:string;subjectIds:string[];today:string}){return cachedLiveReference(input.levelId,input.levelCode,input.attemptKey,input.subjectIds.slice().sort().join(","),input.today);}
