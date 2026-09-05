import "server-only";

import { unstable_cache } from "next/cache";
import { getHotAcademicReference } from "@/lib/data/d1/hot-screens";
import { createD1AdminClient } from "@/lib/data/d1/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { DashboardAcademicReference, DashboardAcademicSubject, DashboardIcaiUpdate, DashboardLiveReference } from "./types";

type ResourceRow = Database["public"]["Tables"]["icai_resources"]["Row"];
type SourceRow = Database["public"]["Tables"]["icai_sources"]["Row"];
type ResourceAttemptRow = Database["public"]["Tables"]["resource_attempt_map"]["Row"];
type ResourceSubjectRow = Database["public"]["Tables"]["resource_subject_map"]["Row"];
type EventRow = Database["public"]["Tables"]["exam_events"]["Row"];

function createReferenceClient() {
  return createD1AdminClient();
}

function jsonRecord(value: Json): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

async function loadAcademicReference(levelCode: string, groupChoice: string, attemptKey: string): Promise<DashboardAcademicReference | null> {
  const direct = await getHotAcademicReference(levelCode, attemptKey);
  if (!direct) return null;
  const aggregateGroups = levelCode === "foundation" || groupChoice === "both" || groupChoice === "not_applicable";
  const allowedGroups = new Set((aggregateGroups ? direct.groups : direct.groups.filter((group) => group.code === groupChoice)).map((group) => group.id));
  const applicableMaps = direct.maps.filter((row) => allowedGroups.has(row.group_id));
  const subjectIds = new Set(applicableMaps.map((row) => row.subject_id));
  const versionBySubject = new Map(applicableMaps.map((row) => [row.subject_id, row.syllabus_version_id]));
  const groupById = new Map(direct.groups.map((group) => [group.id, group]));
  const chaptersByVersion = new Map<string, typeof direct.chapters>();
  for (const chapter of direct.chapters) chaptersByVersion.set(chapter.syllabus_version_id, [...(chaptersByVersion.get(chapter.syllabus_version_id) ?? []), chapter]);
  const subjects: DashboardAcademicSubject[] = direct.subjects
    .filter((subject) => allowedGroups.has(subject.group_id) && subjectIds.has(subject.id))
    .map((subject) => {
      const chapters = chaptersByVersion.get(versionBySubject.get(subject.id) ?? "") ?? [];
      const group = groupById.get(subject.group_id);
      return {
        id: subject.id,
        title: subject.title,
        slug: subject.slug,
        groupCode: group?.code ?? "all",
        groupName: group?.name ?? "All Papers",
        chapterCount: chapters.length,
        chapterIds: chapters.map((chapter) => chapter.id),
      };
    });
  return {
    level: { id: direct.level.id, code: direct.level.code, name: direct.level.name },
    groups: direct.groups
      .filter((group) => aggregateGroups || allowedGroups.has(group.id))
      .map((group) => ({ id: group.id, code: group.code, name: group.name })),
    subjects,
    totalChapters: subjects.reduce((sum, subject) => sum + subject.chapterCount, 0),
  };
}

const cachedAcademicReference = unstable_cache(loadAcademicReference,["phase3-dashboard-academic-v2"],{ revalidate: 3600 });

async function loadLiveReference(levelId: string, levelCode: string, attemptKey: string, subjectIdsKey: string, today: string): Promise<DashboardLiveReference> {
  const client = createReferenceClient();
  const subjectIds = subjectIdsKey ? subjectIdsKey.split(",").filter(Boolean) : [];
  const attemptResponse = await client.from("exam_attempts").select("id,level_id,attempt_key,label,start_date,end_date,source_url,last_seen_at,verification_status").eq("level_id", levelId).eq("attempt_key", attemptKey).eq("verification_status", "verified").maybeSingle();
  if (attemptResponse.error) throw attemptResponse.error;
  const attempt = attemptResponse.data;
  const [eventResponse, resourceResponse, sourceResponse, attemptMapResponse, subjectMapResponse] = await Promise.all([
    attempt ? client.from("exam_events").select("id,attempt_id,title,event_type,event_date,source_url,last_seen_at,verification_status").eq("attempt_id", attempt.id).eq("verification_status", "verified").gte("event_date", today).order("event_date").limit(24) : Promise.resolve({ data: [], error: null }),
    client.from("icai_resources").select("id,resource_type,title,summary,official_url,source_id,metadata,published_on,last_seen_at,last_changed_at,verification_status,status").eq("verification_status", "verified").eq("status", "active").order("last_changed_at", { ascending: false }).limit(24),
    client.from("icai_sources").select("id,name,official_url,is_active").eq("is_active", true),
    attempt ? client.from("resource_attempt_map").select("resource_id,attempt_id").eq("attempt_id", attempt.id) : Promise.resolve({ data: [], error: null }),
    subjectIds.length ? client.from("resource_subject_map").select("resource_id,subject_id").in("subject_id", subjectIds) : Promise.resolve({ data: [], error: null }),
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
  const examEvents = ((eventResponse.data ?? []) as EventRow[]).filter((event) => event.event_type === "exam_start" || event.event_type === "exam_paper").map((event) => ({ id:event.id,title:event.title,eventType:event.event_type,eventDate:event.event_date,sourceUrl:event.source_url,lastVerifiedAt:event.last_seen_at }));
  const verifiedCandidates = [attempt?.last_seen_at ?? null,...examEvents.map((event)=>event.lastVerifiedAt),...updates.map((update)=>update.lastVerifiedAt)].filter((value): value is string => Boolean(value));
  return { attempt: attempt ? { id:attempt.id,key:attempt.attempt_key,label:attempt.label,startDate:attempt.start_date,endDate:attempt.end_date,sourceUrl:attempt.source_url,lastVerifiedAt:attempt.last_seen_at } : null, examEvents, updates, verifiedAt:verifiedCandidates.sort().at(-1)??null };
}

const cachedLiveReference = unstable_cache(loadLiveReference,["phase3-dashboard-live-v2"],{ revalidate: 300 });
export function getDashboardAcademicReference(levelCode:string,groupChoice:string,attemptKey:string){return cachedAcademicReference(levelCode,groupChoice,attemptKey);}
export function getDashboardLiveReference(input:{levelId:string;levelCode:string;attemptKey:string;subjectIds:string[];today:string}){return cachedLiveReference(input.levelId,input.levelCode,input.attemptKey,input.subjectIds.slice().sort().join(","),input.today);}
