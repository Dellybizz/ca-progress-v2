import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { getServerAppRole } from "@/lib/authorization/server";
import { isPrivilegedRole } from "@/lib/authorization/roles";
import { getIcaiPublicCatalog } from "@/lib/icai/query";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StudySubjectOption } from "@/lib/study/types";
import { RESOURCE_BUCKET, SIGNED_URL_SECONDS } from "./validation";
import type { ModerationPageModel, ModerationQueueItem, ModerationReport, NoteCard, NoteDetailModel, OfficialResourceCard, ResourceDetailModel, ResourceLibraryModel, UploadCard } from "./types";

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type TagRow = Database["public"]["Tables"]["note_tags"]["Row"];
type TagMapRow = Database["public"]["Tables"]["note_tag_map"]["Row"];
type UploadRow = Database["public"]["Tables"]["uploaded_resources"]["Row"];
type ReportRow = Database["public"]["Tables"]["resource_reports"]["Row"];

function viewerLabel(name: string | null, email: string | null, phone: string | null) {
  return name?.trim() || email || phone || "Student";
}

function profileReady(profile: Awaited<ReturnType<typeof getProfileForUser>>) {
  return Boolean(profile?.onboarding_completed_at && isCALevel(profile.ca_level) && isGroupChoice(profile.group_choice) && profile.attempt_key && profile.attempt_key !== "undecided");
}

async function academicOptions(profile: Awaited<ReturnType<typeof getProfileForUser>>) {
  if (!profile || !profileReady(profile) || !isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key) return [] as StudySubjectOption[];
  const catalog = await getAcademicCatalog({ level: profile.ca_level, group: profile.group_choice, attempt: profile.attempt_key });
  return catalog.subjects.map((subject) => ({
    id: subject.id,
    slug: subject.slug,
    title: subject.title,
    chapters: subject.chapters.map((chapter) => ({ id: chapter.id, number: chapter.number, title: chapter.title })),
  }));
}

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

async function nameMaps(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const [subjects, chapters] = await Promise.all([
    supabase.from("subjects").select("id,title").eq("is_active", true),
    supabase.from("chapters").select("id,title").limit(5000),
  ]);
  if (subjects.error || chapters.error) throw new Error(`Resource academic labels could not be loaded: ${(subjects.error || chapters.error)?.message}`);
  return {
    subjects: new Map((subjects.data ?? []).map((row) => [row.id, row.title])),
    chapters: new Map((chapters.data ?? []).map((row) => [row.id, row.title])),
  };
}

function noteDto(row: NoteRow, names: Awaited<ReturnType<typeof nameMaps>>, tags: string[], viewerId: string): NoteCard {
  return {
    id: row.id,
    title: row.title,
    excerpt: excerpt(row.body_text),
    bodyHtml: row.body_html,
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    subjectTitle: row.subject_id ? names.subjects.get(row.subject_id) ?? null : null,
    chapterTitle: row.chapter_id ? names.chapters.get(row.chapter_id) ?? null : null,
    tags,
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

async function tagsForOwnNotes(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const [tagsResponse, mapsResponse] = await Promise.all([
    supabase.from("note_tags").select("*").eq("user_id", userId),
    supabase.from("note_tag_map").select("*").eq("user_id", userId),
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
  const identity = await optionalUser();
  const profile = identity ? await getProfileForUser(identity.id) : null;
  const official = await getIcaiPublicCatalog(profileReady(profile) && profile && isCALevel(profile.ca_level)
    ? { level: profile.ca_level, attempt: profile.attempt_key }
    : {});
  const officialResources = officialCards(official);
  if (!identity) return { mode: "guest", officialResources };

  const supabase = await createServerSupabaseClient();
  const [names, tagsByNote, ownNotes, ownUploads, sharedNotes, sharedUploads, subjects] = await Promise.all([
    nameMaps(supabase),
    tagsForOwnNotes(supabase, identity.id),
    supabase.from("notes").select("*").eq("user_id", identity.id).order("updated_at", { ascending: false }).limit(250),
    supabase.from("uploaded_resources").select("*").eq("owner_user_id", identity.id).order("updated_at", { ascending: false }).limit(250),
    supabase.from("notes").select("*").eq("visibility", "shared").eq("moderation_status", "approved").neq("user_id", identity.id).order("published_at", { ascending: false }).limit(150),
    supabase.from("uploaded_resources").select("*").eq("visibility", "shared").eq("moderation_status", "approved").neq("owner_user_id", identity.id).order("published_at", { ascending: false }).limit(150),
    academicOptions(profile),
  ]);
  const error = ownNotes.error || ownUploads.error || sharedNotes.error || sharedUploads.error;
  if (error) throw new Error(`Resource library could not be loaded: ${error.message}`);

  return {
    mode: "ready",
    viewerName: viewerLabel(profile?.display_name ?? null, identity.email, identity.phone),
    subjects,
    myNotes: ((ownNotes.data ?? []) as NoteRow[]).map((row) => noteDto(row, names, tagsByNote.get(row.id) ?? [], identity.id)),
    myUploads: ((ownUploads.data ?? []) as UploadRow[]).map((row) => uploadDto(row, names, identity.id)),
    sharedNotes: ((sharedNotes.data ?? []) as NoteRow[]).map((row) => noteDto(row, names, [], identity.id)),
    sharedUploads: ((sharedUploads.data ?? []) as UploadRow[]).map((row) => uploadDto(row, names, identity.id)),
    officialResources,
  };
}

export async function getNoteDetailModel(noteId: string): Promise<NoteDetailModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const supabase = await createServerSupabaseClient();
  const noteResponse = await supabase.from("notes").select("*").eq("id", noteId).maybeSingle();
  if (noteResponse.error) throw new Error(`Note could not be loaded: ${noteResponse.error.message}`);
  if (!noteResponse.data) return { mode: "missing" };
  const row = noteResponse.data as NoteRow;
  const [names, tagsByNote, profile] = await Promise.all([nameMaps(supabase), tagsForOwnNotes(supabase, identity.id), getProfileForUser(identity.id)]);
  const canManage = row.user_id === identity.id;
  return {
    mode: "ready",
    note: noteDto(row, names, canManage ? tagsByNote.get(row.id) ?? [] : [], identity.id),
    subjects: canManage ? await academicOptions(profile) : [],
    canManage,
    canReport: !canManage && row.visibility === "shared" && row.moderation_status === "approved",
  };
}

export async function getResourceDetailModel(resourceId: string): Promise<ResourceDetailModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const supabase = await createServerSupabaseClient();
  const response = await supabase.from("uploaded_resources").select("*").eq("id", resourceId).maybeSingle();
  if (response.error) throw new Error(`Resource could not be loaded: ${response.error.message}`);
  if (!response.data) return { mode: "missing" };
  const names = await nameMaps(supabase);
  const row = response.data as UploadRow;
  const canManage = row.owner_user_id === identity.id;
  return { mode: "ready", resource: uploadDto(row, names, identity.id), canManage, canReport: !canManage && row.visibility === "shared" && row.moderation_status === "approved" };
}

export async function createResourceSignedUrl(resourceId: string, download: boolean) {
  const identity = await optionalUser();
  if (!identity) return null;
  const supabase = await createServerSupabaseClient();
  const response = await supabase.from("uploaded_resources").select("id,owner_user_id,visibility,moderation_status,storage_bucket,storage_path,safe_filename").eq("id", resourceId).maybeSingle();
  if (response.error || !response.data) return null;
  const row = response.data;
  const allowed = row.owner_user_id === identity.id || (row.visibility === "shared" && row.moderation_status === "approved");
  if (!allowed || row.storage_bucket !== RESOURCE_BUCKET) return null;
  const admin = createAdminSupabaseClient();
  const signed = await admin.storage.from(RESOURCE_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_SECONDS, download ? { download: row.safe_filename } : undefined);
  if (signed.error) throw new Error(`Signed resource access could not be created: ${signed.error.message}`);
  return signed.data.signedUrl;
}

export async function getResourceModerationPageModel(): Promise<ModerationPageModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "denied" };
  const role = await getServerAppRole();
  if (!isPrivilegedRole(role)) return { mode: "denied" };
  const admin = createAdminSupabaseClient();
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
