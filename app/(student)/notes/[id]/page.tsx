import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import { NoteEditor } from "@/components/resources/note-editor";
import { NoteOwnerActions } from "@/components/resources/resource-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getNoteDetailModel } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Note | CA Progress" };

function SourceCard({ source }: { source: NonNullable<Extract<Awaited<ReturnType<typeof getNoteDetailModel>>, { mode: "ready" }>["note"]["source"]> }) {
  return <Card><CardHeader title="Saved from Community" description="Source attribution is retained with this revision note." action={<Badge tone="brand">Attributed</Badge>}/><CardBody><div className="phase7-document-meta"><span>Answer by {source.authorLabel ?? "Community member"}</span>{source.createdAt ? <span>{new Date(source.createdAt).toLocaleString()}</span> : null}</div>{source.question ? <div><strong>Original question</strong><p>{source.question}</p></div> : null}{source.answer ? <div><strong>Saved answer</strong><p>{source.answer}</p></div> : null}{source.discussionPath ? <Link className="ui-text-link" href={source.discussionPath}>Open original discussion →</Link> : null}</CardBody></Card>;
}

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await getNoteDetailModel(id);
  if (model.mode === "guest") return <div className="phase7-page"><LoginRequired next={`/notes/${id}`} title="Sign in to view this note"/></div>;
  if (model.mode === "missing") notFound();
  const { note } = model;
  const linkedUploads = model.availableUploads.filter((upload) => note.resourceIds.includes(upload.id));
  if (model.canManage) return <div className="phase7-page"><PageHeader preview={false} eyebrow="My revision note" title={note.title} description={`${note.subjectTitle ?? "General Notes"}${note.chapterTitle ? ` · ${note.chapterTitle}` : ""}${note.topicTitle ? ` · ${note.topicTitle}` : ""}`}/>{note.source ? <SourceCard source={note.source}/> : null}<Card><CardHeader title="Edit revision note" description="Headings, lists, checklists, highlights, links and tables round-trip through the same sanitized note document. Sharing remains explicit." action={<Badge tone={note.moderationStatus === "approved" ? "success" : note.moderationStatus === "pending" ? "warning" : note.moderationStatus === "rejected" || note.moderationStatus === "reported" ? "danger" : "neutral"}>{note.moderationStatus}</Badge>}/><CardBody><NoteEditor note={note} subjects={model.subjects} availableUploads={model.availableUploads}/>{linkedUploads.length ? <div><strong>Linked private files</strong><div className="phase7-document-meta">{linkedUploads.map((upload) => <Link key={upload.id} href={`/resources/${upload.id}`}>{upload.title} · {upload.extension.toUpperCase()}</Link>)}</div></div> : null}<div className="phase7-editor-actions"><a className="ui-button ui-button--secondary" href={`/api/notes/${note.id}/export`}>Export note JSON</a></div><NoteOwnerActions id={note.id} canReport={false}/></CardBody></Card></div>;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow="Community · Approved" title={note.title} description={`${note.ownerLabel} · ${note.subjectTitle ?? "General note"}`}/>{note.source ? <SourceCard source={note.source}/> : null}<Card className="phase7-community-detail"><CardHeader title="Shared note" description="This note was explicitly shared and passed CA Progress resource moderation." action={<Badge tone="success">Community · Approved</Badge>}/><CardBody><div className="phase7-rich-reader" dangerouslySetInnerHTML={{ __html: note.bodyHtml }}/><div className="phase7-document-meta">{note.chapterTitle ? <span>{note.chapterTitle}</span> : null}{note.topicTitle ? <span>{note.topicTitle}</span> : null}{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><NoteOwnerActions id={note.id} canReport={model.canReport}/></CardBody></Card></div>;
}
