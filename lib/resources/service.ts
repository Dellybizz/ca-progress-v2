import "server-only";

import { optionalUser } from "@/lib/auth/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { getServerAppRole } from "@/lib/authorization/server";
import { isPrivilegedRole } from "@/lib/authorization/roles";
import { getIcaiPublicCatalog } from "@/lib/icai/query";
import { createD1AdminClient, createD1ServerClient } from "@/lib/data/d1/client";
import type { Database } from "@/lib/data/database.types";
import { getHotResourceLibraryRows, getHotResourceDetail } from "@/lib/data/d1/hot-screens";
import { getPhase6AcademicOptions, getPhase6NoteExtras } from "@/lib/notes/phase6";
import type { NotePhase6Extra } from "@/lib/notes/types";
import type { ModerationPageModel, ModerationQueueItem, ModerationReport, NoteCard, NoteDetailModel, OfficialResourceCard, ResourceDetailModel, ResourceLibraryModel, UploadCard } from "./types";

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type TagRow = Database["public"]["Tables"]["note_tags"]["Row"];
type TagMapRow = Database["public"]["Tables"]["note_tag_map"]["Row"];
type UploadRow = Database["public"]["Tables"]["uploaded_resources"]["Row"];
type ReportRow = Database["public"]["Tables"]["resource_reports"]["Row"];
type NamedRow = { id: string; title: string };

function excerpt(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 180 ? `${value.slice(0, 177)}…` : value;
}

function officialCards(catalog: Awaited<ReturnType<typeof getIcaiPublicCatalog>>): OfficialResourceCard[] {
  return catalog.resources.slice(0, 120).map((resource) => ({
    id: resource.id,
    title: resource.title,
    summary: resource.summary,
    resourceType: resource.type,
    officialUrl: resource.officialUrl,
    sourceName: resource.sourceName,
    lastVerifiedAt: resource.lastVerifiedAt,
    publishedOn: resource.publishedOn,
    subjects: resource.subjects,
  }));
}

async function nameMaps(client: Awaited<ReturnType<typeof createD1ServerClient>>) {
  const [subjects, chapters] = await Promise.all([
    client.from("subjects").select("id,title").eq("is_active", true),
    client.from("chapters").select("id,title").limit(5000),
  ]);
  if (subjects.error || chapters.error) throw new Error(`Resource academic labels could not be loaded: ${(subjects.error || chapters.error)?.message}`);
  return {
    subjects: new Map(((subjects.data ?? []) as NamedRow[]).map((row) => [row.id, row.title])),
    chapters: new Map(((chapters.data ?? []) as NamedRow[]).map((row) => [row.id, row.title])),
  };
}

function noteDto(row: NoteRow, names: Awaited<ReturnType<typeof nameMaps>>, tags: string[], viewerId: string, extra?: NotePhase6Extra): NoteCard {
  return {
    id: row.id,
    title: row.title,
    excerpt: excerpt(row.body_text),
    bodyHtml: row.body_html,
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    topicId: extra?.topicId ?? null,
    subjectTitle: row.subject_id ? names.subjects.get(row.subject_id) ?? null : null,
    chapterTitle: row.chapter_id ? names.chapters.get(row.chapter_id) ?? null : null,
    topicTitle: extra?.topicTitle ?? null,
    tags,
    resourceIds: extra?.resourceIds ?? [],
    source: extra?.source ?? null,
    visibility: row.visibility as NoteCard["visibility"],
    moderationStatus: row.moderation_status as NoteCard["moderationStatus"],
    ownerLabel: row.owner_label,
    isOwner: row.user_id === viewerId,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function uploadDto(row: UploadRow, names: Awaited<ReturnType<typeof nameMaps>>, viewerId: string): UploadCard {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    extension: row.extension,
    sizeBytes: Number(row.size_bytes),
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    subjectTitle: row.subject_id ? names.subjects.get(row.subject_id) ?? null : null,
    chapterTitle: row.chapter_id ? names.chapters.get(row.chapter_id) ?? null : null,
    visibility: row.visibility as UploadCard["visibility"],
    moderationStatus: row.moderation_status as UploadCard["moderationStatus"],
    ownerLabel: row.owner_label,
    isOwner: row.owner_user_id === viewerId,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

async function tagsForOwnNotes(client: Awaited<ReturnType<typeof createD1ServerClient>>, userId: string) {
  const [tagsResponse, mapsResponse] = await Promise.all([
    client.from("note_tags").select("*").eq("user_id", userId),
    client.from("note_tag_map").select("*").eq("user_id", userId),
  ]);
  if (tagsResponse.error || mapsResponse.error) throw new Error(`Note tags could not be loaded: ${(tagsResponse.error || mapsResponse.error)?.message}`);
  const tagById = new Map(((tagsResponse.data ?? []) as TagRow[]).map((tag) => [tag.id, tag.name]));
  const tagsByNote = new Map<string, string[]>();
  for (const row of (mapsResponse.data ?? []) as TagMapRow[]) {
    const tag = tagById.get(row.tag_id);
    if (tag) tagsByNote.set(row.note_id, [...(tagsByNote.get(row.note_id) ?? []), tag]);
  }
  return tagsByNote;
}

export async function getResourceLibraryModel(): Promise<ResourceLibraryModel> {
  const context = await getStudentContext();
  if (context.mode === "guest") return { mode: "guest", officialResources: officialCards(await getIcaiPublicCatalog({})) };
  if (context.mode !== "ready" || !context.selection || !context.userId) return { mode: "setup", viewerName: context.displayName, officialResources: [] };
  const officialResources = officialCards(await getIcaiPublicCatalog({ level: context.selection.level, attempt: context.selection.attemptKey }));
  const identity = { id: context.userId };

  const client = await createD1ServerClient();
  const [names, tagsByNote, rows, subjects] = await Promise.all([
    nameMaps(client),
    tagsForOwnNotes(client, identity.id),
    getHotResourceLibraryRows(identity.id),
    getPhase6AcademicOptions(identity.id),
  ]);
  const allNoteIds = [...rows.ownNotes, ...rows.sharedNotes].map((row) => row.id);
  const extras = await getPhase6NoteExtras(allNoteIds, identity.id);
  const subjectIds = new Set(context.subjectIds);
  const scoped = <T extends { subject_id?: string | null }>(items: T[]) => items.filter((row) => !row.subject_id || subjectIds.has(row.subject_id));
  return {
    mode: "ready",
    viewerName: context.displayName,
    subjects: subjects.filter((subject)=>subjectIds.has(subject.id)),
    myNotes: scoped(rows.ownNotes).map((row) => noteDto(row as NoteRow, names, tagsByNote.get(row.id) ?? [], identity.id, extras.get(row.id))),
    myUploads: scoped(rows.ownUploads).map((row) => uploadDto(row as UploadRow, names, identity.id)),
    sharedNotes: scoped(rows.sharedNotes).map((row) => noteDto(row as NoteRow, names, [], identity.id, extras.get(row.id))),
    sharedUploads: scoped(rows.sharedUploads).map((row) => uploadDto(row as UploadRow, names, identity.id)),
    officialResources,
  };
}

export async function getNoteDetailModel(noteId: string): Promise<NoteDetailModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const client = await createD1ServerClient();
  const noteResponse = await client.from("notes").select("*").eq("id", noteId).maybeSingle();
  if (noteResponse.error) throw new Error(`Note could not be loaded: ${noteResponse.error.message}`);
  if (!noteResponse.data) return { mode: "missing" };
  const row = noteResponse.data as NoteRow;
  const canManage = row.user_id === identity.id;
  if (!canManage && !(row.visibility === "shared" && row.moderation_status === "approved")) return { mode: "missing" };

  const [names, tagsByNote, subjects, extras, ownedRows] = await Promise.all([
    nameMaps(client),
    tagsForOwnNotes(client, identity.id),
    canManage ? getPhase6AcademicOptions(identity.id) : Promise.resolve([]),
    getPhase6NoteExtras([row.id], identity.id),
    canManage ? getHotResourceLibraryRows(identity.id) : Promise.resolve({ ownUploads: [] as unknown[], ownNotes: [], sharedNotes: [], sharedUploads: [] }),
  ]);
  return {
    mode: "ready",
    note: noteDto(row, names, canManage ? tagsByNote.get(row.id) ?? [] : [], identity.id, extras.get(row.id)),
    subjects,
    availableUploads: canManage ? ownedRows.ownUploads.map((upload) => uploadDto(upload as UploadRow, names, identity.id)) : [],
    canManage,
    canReport: !canManage,
  };
}

export async function getResourceDetailModel(resourceId: string): Promise<ResourceDetailModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const client = await createD1ServerClient();
  const row = (await getHotResourceDetail(resourceId)) as UploadRow | null;
  if (!row) return { mode: "missing" };
  const names = await nameMaps(client);
  const canManage = row.owner_user_id === identity.id;
  return { mode: "ready", resource: uploadDto(row, names, identity.id), canManage, canReport: !canManage && row.visibility === "shared" && row.moderation_status === "approved" };
}

export async function getResourceModerationPageModel(): Promise<ModerationPageModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "denied" };
  const role = await getServerAppRole();
  if (!isPrivilegedRole(role)) return { mode: "denied" };
  const admin = createD1AdminClient();
  const [notes, uploads, reports] = await Promise.all([
    admin.from("notes").select("*").eq("visibility", "shared").in("moderation_status", ["pending", "reported"]).order("updated_at", { ascending: true }).limit(200),
    admin.from("uploaded_resources").select("*").eq("visibility", "shared").in("moderation_status", ["pending", "reported"]).order("updated_at", { ascending: true }).limit(200),
    admin.from("resource_reports").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200),
  ]);
  const error = notes.error || uploads.error || reports.error;
  if (error) throw new Error(`Resource moderation queue could not be loaded: ${error.message}`);

  const queue: ModerationQueueItem[] = [
    ...((notes.data ?? []) as NoteRow[]).map((row) => ({ entityType: "note" as const, id: row.id, title: row.title, ownerLabel: row.owner_label, status: row.moderation_status as "pending" | "reported", kindLabel: "Rich note", description: excerpt(row.body_text), submittedAt: row.updated_at })),
    ...((uploads.data ?? []) as UploadRow[]).map((row) => ({ entityType: "upload" as const, id: row.id, title: row.title, ownerLabel: row.owner_label, status: row.moderation_status as "pending" | "reported", kindLabel: row.extension.toUpperCase(), description: row.description, submittedAt: row.updated_at })),
  ].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  const reportRows = (reports.data ?? []) as ReportRow[];
  const reportItems: ModerationReport[] = reportRows.map((row) => ({
    id: row.id,
    entityType: row.entity_type as ModerationReport["entityType"],
    targetId: row.entity_type === "note" ? row.note_id! : row.uploaded_resource_id!,
    reason: row.reason as ModerationReport["reason"],
    details: row.details,
    createdAt: row.created_at,
  }));
  return { mode: "ready", role, queue, reports: reportItems };
}
