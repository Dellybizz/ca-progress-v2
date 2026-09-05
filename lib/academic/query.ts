import "server-only";

import { createD1ServerClient } from "@/lib/data/d1/client";
import { getSharedPublicJson } from "@/lib/cache/public";
import type { Database } from "@/lib/data/database.types";
import {
  AcademicDataError,
  type AcademicCatalog,
  type AcademicChapter,
  type AcademicLevel,
  type AcademicLevelCode,
  type AcademicSearchResult,
  type AcademicSelection,
  type AcademicSubject,
  type AcademicVersion,
  type AcademicVersionPreview,
} from "./types";

type LevelRow = Database["public"]["Tables"]["course_levels"]["Row"];
type GroupRow = Database["public"]["Tables"]["course_groups"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type VersionRow = Database["public"]["Tables"]["syllabus_versions"]["Row"];
type ChapterRow = Database["public"]["Tables"]["chapters"]["Row"];
type TopicRow = Database["public"]["Tables"]["topics"]["Row"];
type AttemptMapRow = Database["public"]["Tables"]["attempt_syllabus_map"]["Row"];

type RawAcademic = { levels: LevelRow[]; groups: GroupRow[]; subjects: SubjectRow[]; versions: VersionRow[]; chapters: ChapterRow[]; topics: TopicRow[]; attemptMap: AttemptMapRow[] };

function levelDto(row: LevelRow): AcademicLevel {
  return { id: row.id, code: row.code as AcademicLevelCode, name: row.name, sortOrder: row.sort_order };
}

function versionDto(row: VersionRow): AcademicVersion {
  return { id: row.id, key: row.version_key, title: row.title, status: row.status as AcademicVersion["status"], effectiveFrom: row.effective_from, effectiveTo: row.effective_to, supersedesVersionId: row.supersedes_version_id, sourceUrl: row.source_url, sourceLabel: row.source_label, sourceVerifiedAt: row.source_verified_at };
}

async function loadRawAcademic(): Promise<RawAcademic> {
  const client = await createD1ServerClient();
  const [levels, groups, subjects, versions, chapters, topics, attemptMap] = await Promise.all([
    client.from("course_levels").select("id,code,name,sort_order,is_active,created_at,updated_at").eq("is_active", true).order("sort_order"),
    client.from("course_groups").select("id,level_id,code,name,sort_order,is_default,is_active,created_at,updated_at").eq("is_active", true).order("sort_order"),
    client.from("subjects").select("id,code,slug,paper_label,title,subject_kind,level_id,group_id,source_url,is_active,sort_order,created_at,updated_at").eq("is_active", true).order("sort_order"),
    client.from("syllabus_versions").select("id,version_key,title,status,effective_from,effective_to,supersedes_version_id,source_url,source_label,source_verified_at,subject_id,content_hash,created_at,updated_at,verification_method").order("effective_from", { ascending: false }),
    client.from("chapters").select("id,stable_key,chapter_number,title,section_key,chapter_kind,syllabus_version_id,sort_order,slug,source_url,created_at,updated_at").order("sort_order"),
    client.from("topics").select("id,stable_key,unit_number,title,topic_kind,chapter_id,sort_order,source_url,created_at,updated_at").order("sort_order"),
    client.from("attempt_syllabus_map").select("id,level_id,attempt_key,group_id,subject_id,syllabus_version_id,created_at").order("attempt_key"),
  ]);
  const firstError = [levels.error, groups.error, subjects.error, versions.error, chapters.error, topics.error, attemptMap.error].find(Boolean);
  if (firstError) throw new AcademicDataError(firstError.message);
  return { levels: levels.data ?? [], groups: groups.data ?? [], subjects: subjects.data ?? [], versions: versions.data ?? [], chapters: chapters.data ?? [], topics: topics.data ?? [], attemptMap: attemptMap.data ?? [] };
}

async function getCachedRawAcademic() {
  return getSharedPublicJson({ namespace: "academic", key: "catalog-v1", ttlSeconds: 3600, load: loadRawAcademic });
}

function versionForSubject(raw: RawAcademic, subjectId: string, attempt?: string | null) {
  if (attempt) {
    const mapped = raw.attemptMap.find((item) => item.attempt_key === attempt && item.subject_id === subjectId);
    return mapped ? raw.versions.find((item) => item.id === mapped.syllabus_version_id) ?? null : null;
  }
  return raw.versions.filter((item) => item.subject_id === subjectId && item.status === "published").sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

function subjectDto(raw: RawAcademic, subject: SubjectRow, version: VersionRow): AcademicSubject {
  const chapters: AcademicChapter[] = raw.chapters.filter((item) => item.syllabus_version_id === version.id).map((chapter) => ({
    id: chapter.id,
    stableKey: chapter.stable_key,
    number: chapter.chapter_number,
    title: chapter.title,
    sectionKey: chapter.section_key,
    kind: chapter.chapter_kind,
    topics: raw.topics.filter((topic) => topic.chapter_id === chapter.id).map((topic) => ({ id: topic.id, stableKey: topic.stable_key, unitNumber: topic.unit_number, title: topic.title, kind: topic.topic_kind })),
  }));
  return { id: subject.id, code: subject.code, slug: subject.slug, paperLabel: subject.paper_label, title: subject.title, kind: subject.subject_kind, levelId: subject.level_id, groupId: subject.group_id, sourceUrl: subject.source_url, version: versionDto(version), chapters };
}

function normalizeSelection(raw: RawAcademic, selection: AcademicSelection) {
  const levels = raw.levels.map(levelDto);
  if (!levels.length) throw new AcademicDataError("No academic levels are published.");
  const selectedLevel = levels.find((level) => level.code === selection.level) ?? levels[0];
  const groupsForLevel = raw.groups.filter((group) => group.level_id === selectedLevel.id);
  const isAggregateGroup = selection.group === "all" || selection.group === "both";
  const requestedGroup = isAggregateGroup ? "all" : selection.group && groupsForLevel.some((group) => group.code === selection.group) ? selection.group : null;
  const selectedGroup = requestedGroup ?? groupsForLevel.find((group) => group.is_default)?.code ?? groupsForLevel[0]?.code ?? "all";
  const attempts = [...new Set(raw.attemptMap.filter((item) => item.level_id === selectedLevel.id).map((item) => item.attempt_key))].sort().reverse();
  const selectedAttempt = selection.attempt && attempts.includes(selection.attempt) ? selection.attempt : null;
  return { levels, selectedLevel, groupsForLevel, selectedGroup, attempts, selectedAttempt };
}

function allowedGroupIds(groups: GroupRow[], selectedGroup: string) {
  return new Set((selectedGroup === "all" || selectedGroup === "both" ? groups : groups.filter((group) => group.code === selectedGroup)).map((group) => group.id));
}

export async function getAcademicCatalog(selection: AcademicSelection = {}): Promise<AcademicCatalog> {
  const raw = await getCachedRawAcademic();
  const normalized = normalizeSelection(raw, selection);
  const groups = normalized.groupsForLevel.map((group) => ({ id: group.id, code: group.code, name: group.name, sortOrder: group.sort_order, isDefault: group.is_default }));
  const groupIds = allowedGroupIds(normalized.groupsForLevel, normalized.selectedGroup);
  const subjects = raw.subjects.filter((subject) => subject.level_id === normalized.selectedLevel.id && groupIds.has(subject.group_id)).map((subject) => {
    const version = versionForSubject(raw, subject.id, normalized.selectedAttempt);
    return version ? subjectDto(raw, subject, version) : null;
  }).filter((subject): subject is AcademicSubject => Boolean(subject));
  return {
    levels: normalized.levels,
    groups,
    attempts: normalized.attempts,
    selectedLevel: normalized.selectedLevel,
    selectedGroup: normalized.selectedGroup,
    selectedAttempt: normalized.selectedAttempt,
    subjects,
    sourceVerifiedAt: subjects.map((subject) => subject.version.sourceVerifiedAt).sort().at(-1) ?? null,
  };
}

export async function getSubjectBySlug(slug: string, attempt?: string | null): Promise<AcademicSubject | null> {
  const raw = await getCachedRawAcademic();
  const subject = raw.subjects.find((item) => item.slug === slug);
  if (!subject) return null;
  const version = versionForSubject(raw, subject.id, attempt);
  return version ? subjectDto(raw, subject, version) : null;
}

export async function searchAcademicCatalog(query: string, selection: AcademicSelection = {}, limit = 24): Promise<AcademicSearchResult[]> {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  const raw = await getCachedRawAcademic();
  const normalized = normalizeSelection(raw, selection);
  const allowedGroups = allowedGroupIds(normalized.groupsForLevel, normalized.selectedGroup);
  const levelById = new Map(raw.levels.map((level) => [level.id, level]));
  const groupById = new Map(raw.groups.map((group) => [group.id, group]));
  const topicsByChapter = new Map<string, TopicRow[]>();
  for (const topic of raw.topics) topicsByChapter.set(topic.chapter_id, [...(topicsByChapter.get(topic.chapter_id) ?? []), topic]);
  const results: AcademicSearchResult[] = [];

  for (const subject of raw.subjects) {
    if (subject.level_id !== normalized.selectedLevel.id || !allowedGroups.has(subject.group_id)) continue;
    const version = versionForSubject(raw, subject.id, normalized.selectedAttempt);
    if (!version) continue;
    const level = levelById.get(subject.level_id);
    const group = groupById.get(subject.group_id);
    if (!level || !group) continue;
    const base = { subjectSlug: subject.slug, subjectTitle: subject.title, levelCode: level.code as AcademicLevelCode, groupCode: group.code };
    if (`${subject.paper_label} ${subject.title} ${subject.code}`.toLocaleLowerCase().includes(q)) results.push({ type: "subject", id: subject.id, title: subject.title, subtitle: `${level.name} · ${group.name} · ${subject.paper_label}`, ...base });
    for (const chapter of raw.chapters.filter((item) => item.syllabus_version_id === version.id)) {
      if (`${chapter.chapter_number} ${chapter.title} ${chapter.section_key ?? ""}`.toLocaleLowerCase().includes(q)) results.push({ type: "chapter", id: chapter.id, title: chapter.title, subtitle: `${subject.title} · Chapter ${chapter.chapter_number}`, chapterId: chapter.id, ...base });
      for (const topic of topicsByChapter.get(chapter.id) ?? []) {
        if (`${topic.unit_number ?? ""} ${topic.title}`.toLocaleLowerCase().includes(q)) results.push({ type: "topic", id: topic.id, title: topic.title, subtitle: `${subject.title} · ${chapter.title}`, chapterId: chapter.id, ...base });
      }
    }
  }
  return results.slice(0, Math.max(1, Math.min(limit, 50)));
}

export async function getAcademicVersionPreview(): Promise<AcademicVersionPreview[]> {
  const raw = await getCachedRawAcademic();
  const subjectById = new Map(raw.subjects.map((subject) => [subject.id, subject]));
  const levelById = new Map(raw.levels.map((level) => [level.id, level]));
  const groupById = new Map(raw.groups.map((group) => [group.id, group]));
  const previews = raw.versions.map((version) => {
    const subject = subjectById.get(version.subject_id);
    if (!subject) throw new AcademicDataError("A syllabus version is missing its subject.");
    const level = levelById.get(subject.level_id);
    const group = groupById.get(subject.group_id);
    if (!level || !group) throw new AcademicDataError("A subject is missing its level or group.");
    const chapterIds = raw.chapters.filter((chapter) => chapter.syllabus_version_id === version.id).map((chapter) => chapter.id);
    const chapterSet = new Set(chapterIds);
    return { ...versionDto(version), subjectTitle: subject.title, subjectSlug: subject.slug, levelName: level.name, groupName: group.name, chapterCount: chapterIds.length, topicCount: raw.topics.filter((topic) => chapterSet.has(topic.chapter_id)).length };
  });
  return previews.sort((a, b) => a.levelName.localeCompare(b.levelName) || a.subjectTitle.localeCompare(b.subjectTitle) || b.effectiveFrom.localeCompare(a.effectiveFrom));
}
