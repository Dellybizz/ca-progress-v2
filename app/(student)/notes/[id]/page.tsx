import type { Metadata } from "next";
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

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await getNoteDetailModel(id);
  if (model.mode === "guest") return <div className="phase7-page"><LoginRequired next={`/notes/${id}`} title="Sign in to view this note"/></div>;
  if (model.mode === "missing") notFound();
  const { note } = model;
  if (model.canManage) return <div className="phase7-page"><PageHeader preview={false} eyebrow="My Note" title={note.title} description={`${note.subjectTitle ?? "General"}${note.chapterTitle ? ` · ${note.chapterTitle}` : ""}`}/><Card><CardHeader title="Edit note" description="Private by default. Shared changes return to moderation before Community publication." action={<Badge tone={note.moderationStatus === "approved" ? "success" : note.moderationStatus === "pending" ? "warning" : note.moderationStatus === "rejected" || note.moderationStatus === "reported" ? "danger" : "neutral"}>{note.moderationStatus}</Badge>}/><CardBody><NoteEditor note={note} subjects={model.subjects}/><NoteOwnerActions id={note.id} canReport={false}/></CardBody></Card></div>;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow="Community · Approved" title={note.title} description={`${note.ownerLabel} · ${note.subjectTitle ?? "General note"}`}/><Card className="phase7-community-detail"><CardHeader title="Shared note" description="This note passed CA Progress resource moderation." action={<Badge tone="success">Community · Approved</Badge>}/><CardBody><div className="phase7-rich-reader" dangerouslySetInnerHTML={{ __html: note.bodyHtml }}/><div className="phase7-document-meta">{note.chapterTitle ? <span>{note.chapterTitle}</span> : null}{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><NoteOwnerActions id={note.id} canReport={model.canReport}/></CardBody></Card></div>;
}
