import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import {NoteReader} from "@/components/notes/note-reader";
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
  if(model.canManage)return <div className="note-authoring-entry"><NoteEditor note={note} subjects={model.subjects} availableUploads={model.availableUploads}/></div>;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow="Community · Approved" title={note.title} description={`${note.ownerLabel} · ${note.subjectTitle ?? "General note"}`}/>{note.source ? <SourceCard source={note.source}/> : null}<Card className="phase7-community-detail"><CardHeader title="Shared note" description="This note was explicitly shared and passed CA Progress resource moderation." action={<Badge tone="success">Community · Approved</Badge>}/><CardBody><NoteReader html={note.bodyHtml}/><div className="phase7-document-meta">{note.chapterTitle ? <span>{note.chapterTitle}</span> : null}{note.topicTitle ? <span>{note.topicTitle}</span> : null}{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><NoteOwnerActions id={note.id} canReport={model.canReport}/></CardBody></Card></div>;
}
