import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getStudentContext, selectionForAcademicQuery } from "@/lib/academic/student-context";
import { optionalUser } from "@/lib/auth/server";
import { getHotD1Database } from "@/lib/data/d1/runtime";
import { saveHotNote } from "@/lib/data/d1/hot-screens";
import type { CommunityNoteDraft, NotePhase6Extra, NoteSubjectOption } from "./types";

type TopicRow = { id: string; chapter_id: string; title: string; topic_kind: string; unit_number: string | null; sort_order: number };
type CommunitySourceRow = {
  id: string;
  channel_id: string;
  author_label: string;
  body: string;
  created_at: string;
  moderation_status: string;
  reply_to_message_id: string | null;
  channel_slug: string;
  subject_id: string | null;
  scope_type: string;
  level_id: string | null;
  question_body: string | null;
};
type MetadataRow = {
  note_id: string;
  user_id: string;
  topic_id: string | null;
  topic_title: string | null;
  document_json: string;
  source_type: "manual" | "community";
  source_message_id: string | null;
  source_channel_id: string | null;
  source_author_label: string | null;
  source_question: string | null;
  source_answer: string | null;
  source_created_at: string | null;
  source_discussion_path: string | null;
};
type LinkRow = { note_id: string; resource_id: string };

export async function getPhase6AcademicOptions(userId: string): Promise<NoteSubjectOption[]> {
  const context = await getStudentContext();
  if (context.mode !== "ready" || context.userId !== userId) return [];
  const catalog = await getAcademicCatalog(selectionForAcademicQuery(context));
  const chapterIds = catalog.subjects.flatMap((subject) => subject.chapters.map((chapter) => chapter.id));
  const db = getHotD1Database();
  const topics = chapterIds.length
    ? ((await db.prepare(`SELECT id,chapter_id,title,topic_kind,unit_number,sort_order FROM topics WHERE chapter_id IN (${chapterIds.map((_, index) => `?${index + 1}`).join(",")}) ORDER BY chapter_id,sort_order`).bind(...chapterIds).all<TopicRow>()).results ?? [])
    : [];
  const byChapter = new Map<string, TopicRow[]>();
  for (const topic of topics) byChapter.set(topic.chapter_id, [...(byChapter.get(topic.chapter_id) ?? []), topic]);
  return catalog.subjects.map((subject) => ({
    id: subject.id,
    slug: subject.slug,
    title: subject.title,
    chapters: subject.chapters.map((chapter) => ({
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      topics: (byChapter.get(chapter.id) ?? []).map((topic) => ({ id: topic.id, title: topic.title, kind: topic.topic_kind, unitNumber: topic.unit_number })),
    })),
  }));
}

function suggestedTitle(answer: string) {
  const clean = answer.replace(/\s+/g, " ").trim();
  return (clean.length > 72 ? `${clean.slice(0, 69)}…` : clean) || "Community answer";
}

async function resolveCommunitySource(userId: string, messageId: string): Promise<CommunityNoteDraft> {
  const db = getHotD1Database();
  const row = await db.prepare(`SELECT m.id,m.channel_id,m.author_label,m.body,m.created_at,m.moderation_status,m.reply_to_message_id,
    cc.slug AS channel_slug,cc.subject_id,cc.scope_type,cc.level_id,q.body AS question_body
    FROM community_messages m
    JOIN community_channels cc ON cc.id=m.channel_id AND cc.is_active=1
    LEFT JOIN community_messages q ON q.id=m.reply_to_message_id
    WHERE m.id=?1 AND m.moderation_status='active' LIMIT 1`).bind(messageId).first<CommunitySourceRow>();
  if (!row) throw new Error("That Community answer is no longer available.");

  const options = await getPhase6AcademicOptions(userId);
  const subjectIds = new Set(options.map((subject) => subject.id));
  if (row.subject_id && !subjectIds.has(row.subject_id)) throw new Error("That Community answer is outside your current academic scope.");
  if (row.scope_type === "level" && row.level_id && subjectIds.size) {
    const ids = [...subjectIds];
    const levels = await db.prepare(`SELECT DISTINCT level_id FROM subjects WHERE id IN (${ids.map((_, index) => `?${index + 1}`).join(",")})`).bind(...ids).all<{ level_id: string }>();
    if (!(levels.results ?? []).some((entry) => entry.level_id === row.level_id)) throw new Error("That Community answer is outside your current level.");
  }

  return {
    messageId: row.id,
    channelId: row.channel_id,
    channelSlug: row.channel_slug,
    answer: row.body,
    authorLabel: row.author_label,
    question: row.question_body,
    createdAt: row.created_at,
    discussionPath: `/community/${encodeURIComponent(row.channel_slug)}#message-${row.id}`,
    subjectId: row.subject_id,
    suggestedTitle: suggestedTitle(row.body),
  };
}

export async function getCommunityNoteDraftForViewer(messageId?: string | null): Promise<CommunityNoteDraft | null> {
  if (!messageId) return null;
  const identity = await optionalUser();
  if (!identity) return null;
  try { return await resolveCommunitySource(identity.id, messageId); }
  catch { return null; }
}

async function validateLocation(userId: string, subjectId: string | null, chapterId: string | null, topicId: string | null) {
  if (!subjectId) {
    if (chapterId || topicId) throw new Error("Choose a subject before linking a chapter or Unit/AS.");
    return { levelId: null as string | null };
  }
  const options = await getPhase6AcademicOptions(userId);
  const subject = options.find((item) => item.id === subjectId);
  if (!subject) throw new Error("Selected subject is not available for your current attempt.");
  if (!chapterId) {
    if (topicId) throw new Error("Choose a chapter before linking a Unit/AS.");
  } else {
    const chapter = subject.chapters.find((item) => item.id === chapterId);
    if (!chapter) throw new Error("Selected chapter does not belong to that subject.");
    if (topicId && !chapter.topics.some((topic) => topic.id === topicId)) throw new Error("Selected Unit/AS does not belong to that chapter.");
  }
  const db = getHotD1Database();
  const row = await db.prepare("SELECT level_id FROM subjects WHERE id=?1 LIMIT 1").bind(subjectId).first<{ level_id: string }>();
  return { levelId: row?.level_id ?? null };
}

async function validateOwnedResources(userId: string, resourceIds: string[]) {
  const ids = [...new Set(resourceIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 20);
  if (!ids.length) return [];
  const db = getHotD1Database();
  const rows = await db.prepare(`SELECT id,extension FROM uploaded_resources WHERE owner_user_id=?1 AND id IN (${ids.map((_, index) => `?${index + 2}`).join(",")})`).bind(userId, ...ids).all<{ id: string; extension: string }>();
  if ((rows.results ?? []).length !== ids.length) throw new Error("A linked note file is missing or is not owned by you.");
  return (rows.results ?? []).map((row) => ({ id: row.id, kind: ["jpg","jpeg","png","webp"].includes(row.extension.toLowerCase()) ? "image" : row.extension.toLowerCase() === "pdf" ? "pdf" : "file" }));
}

export async function savePhase6Note(input: {
  id: string | null;
  createId?: string | null;
  userId: string;
  ownerLabel: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  subjectId: string | null;
  chapterId: string | null;
  topicId: string | null;
  tags: string[];
  visibility: "private" | "shared";
  sourceMessageId: string | null;
  resourceIds: string[];
}) {
  const location = await validateLocation(input.userId, input.subjectId, input.chapterId, input.topicId);
  const linkedResources = await validateOwnedResources(input.userId, input.resourceIds);
  const source = input.sourceMessageId ? await resolveCommunitySource(input.userId, input.sourceMessageId) : null;
  const visibility = source && !input.id ? "private" : input.visibility;
  const result = await saveHotNote({
    id: input.id,
    createId: input.createId,
    userId: input.userId,
    ownerLabel: input.ownerLabel,
    title: input.title,
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText,
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    tags: input.tags,
    visibility,
  });

  const db = getHotD1Database();
  const existing = await db.prepare("SELECT source_type,source_message_id,source_channel_id,source_author_label,source_question,source_answer,source_created_at,source_discussion_path FROM note_revision_metadata WHERE note_id=?1 AND user_id=?2 LIMIT 1")
    .bind(result.id, input.userId).first<MetadataRow>();
  const sourceType = source ? "community" : existing?.source_type ?? "manual";
  const sourceMessageId = source?.messageId ?? existing?.source_message_id ?? null;
  const sourceChannelId = source?.channelId ?? existing?.source_channel_id ?? null;
  const sourceAuthor = source?.authorLabel ?? existing?.source_author_label ?? null;
  const sourceQuestion = source?.question ?? existing?.source_question ?? null;
  const sourceAnswer = source?.answer ?? existing?.source_answer ?? null;
  const sourceCreatedAt = source?.createdAt ?? existing?.source_created_at ?? null;
  const sourcePath = source?.discussionPath ?? existing?.source_discussion_path ?? null;
  const documentJson = JSON.stringify({ version: 1, format: "html", html: input.bodyHtml });

  await db.prepare(`INSERT INTO note_revision_metadata(
      note_id,user_id,level_id,subject_id,chapter_id,topic_id,document_json,source_type,
      source_message_id,source_channel_id,source_author_label,source_question,source_answer,source_created_at,source_discussion_path,updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,CURRENT_TIMESTAMP)
    ON CONFLICT(note_id) DO UPDATE SET level_id=excluded.level_id,subject_id=excluded.subject_id,chapter_id=excluded.chapter_id,
      topic_id=excluded.topic_id,document_json=excluded.document_json,source_type=excluded.source_type,
      source_message_id=excluded.source_message_id,source_channel_id=excluded.source_channel_id,source_author_label=excluded.source_author_label,
      source_question=excluded.source_question,source_answer=excluded.source_answer,source_created_at=excluded.source_created_at,
      source_discussion_path=excluded.source_discussion_path,updated_at=CURRENT_TIMESTAMP`)
    .bind(result.id,input.userId,location.levelId,input.subjectId,input.chapterId,input.topicId,documentJson,sourceType,sourceMessageId,sourceChannelId,sourceAuthor,sourceQuestion,sourceAnswer,sourceCreatedAt,sourcePath).run();

  await db.prepare("DELETE FROM note_resource_links WHERE note_id=?1 AND user_id=?2").bind(result.id,input.userId).run();
  if (linkedResources.length) {
    await db.batch(linkedResources.map((resource, index) => db.prepare("INSERT INTO note_resource_links(note_id,resource_id,user_id,embed_kind,position) VALUES (?1,?2,?3,?4,?5)").bind(result.id,resource.id,input.userId,resource.kind,index)));
  }
  return { ...result, visibility };
}

export async function getPhase6NoteExtras(noteIds: string[], viewerId: string) {
  const ids = [...new Set(noteIds)].slice(0, 400);
  const result = new Map<string, NotePhase6Extra>();
  if (!ids.length) return result;
  const db = getHotD1Database();
  const placeholders = ids.map((_, index) => `?${index + 1}`).join(",");
  const [metadata, links] = await Promise.all([
    db.prepare(`SELECT m.note_id,m.user_id,m.topic_id,t.title AS topic_title,m.document_json,m.source_type,m.source_message_id,m.source_channel_id,m.source_author_label,m.source_question,m.source_answer,m.source_created_at,m.source_discussion_path FROM note_revision_metadata m LEFT JOIN topics t ON t.id=m.topic_id WHERE m.note_id IN (${placeholders})`).bind(...ids).all<MetadataRow>(),
    db.prepare(`SELECT note_id,resource_id FROM note_resource_links WHERE user_id=?1 AND note_id IN (${ids.map((_, index) => `?${index + 2}`).join(",")}) ORDER BY position`).bind(viewerId,...ids).all<LinkRow>(),
  ]);
  const linksByNote = new Map<string,string[]>();
  for (const link of links.results ?? []) linksByNote.set(link.note_id,[...(linksByNote.get(link.note_id) ?? []),link.resource_id]);
  for (const row of metadata.results ?? []) result.set(row.note_id, {
    topicId: row.topic_id,
    topicTitle: row.topic_title,
    documentJson: row.document_json,
    source: row.source_type === "community" ? {
      type: "community",
      messageId: row.source_message_id,
      channelId: row.source_channel_id,
      authorLabel: row.source_author_label,
      question: row.source_question,
      answer: row.source_answer,
      createdAt: row.source_created_at,
      discussionPath: row.source_discussion_path,
    } : null,
    resourceIds: linksByNote.get(row.note_id) ?? [],
  });
  return result;
}

export async function getOwnedPhase6NoteExport(userId: string, noteId: string) {
  const db = getHotD1Database();
  const note = await db.prepare("SELECT id,title,body_html,body_text,subject_id,chapter_id,visibility,created_at,updated_at FROM notes WHERE id=?1 AND user_id=?2 LIMIT 1").bind(noteId,userId).first<Record<string, unknown>>();
  if (!note) return null;
  const extras = await getPhase6NoteExtras([noteId], userId);
  const files = await db.prepare(`SELECT r.id,r.title,r.original_filename,r.mime_type,r.extension,r.size_bytes,l.embed_kind,l.position
    FROM note_resource_links l JOIN uploaded_resources r ON r.id=l.resource_id AND r.owner_user_id=l.user_id
    WHERE l.note_id=?1 AND l.user_id=?2 ORDER BY l.position`).bind(noteId,userId).all<Record<string,unknown>>();
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), note, revision: extras.get(noteId) ?? null, attachments: files.results ?? [] };
}
