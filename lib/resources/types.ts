import type { StudySubjectOption } from "@/lib/study/types";

export type ResourceVisibility = "private" | "shared";
export type ModerationStatus = "private" | "pending" | "approved" | "rejected" | "reported";
export type ResourceEntityType = "note" | "upload";
export type ResourceReportReason = "spam" | "misleading" | "copyright" | "unsafe" | "other";

export type NoteCard = {
  id: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  subjectId: string | null;
  chapterId: string | null;
  subjectTitle: string | null;
  chapterTitle: string | null;
  tags: string[];
  visibility: ResourceVisibility;
  moderationStatus: ModerationStatus;
  ownerLabel: string;
  isOwner: boolean;
  updatedAt: string;
  publishedAt: string | null;
};

export type UploadCard = {
  id: string;
  title: string;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  subjectId: string | null;
  chapterId: string | null;
  subjectTitle: string | null;
  chapterTitle: string | null;
  visibility: ResourceVisibility;
  moderationStatus: ModerationStatus;
  ownerLabel: string;
  isOwner: boolean;
  updatedAt: string;
  publishedAt: string | null;
};

export type OfficialResourceCard = {
  id: string;
  title: string;
  summary: string | null;
  resourceType: string;
  officialUrl: string;
  sourceName: string;
  lastVerifiedAt: string;
  publishedOn: string | null;
  subjects: { id: string; title: string }[];
};

export type ResourceLibraryReady = {
  mode: "ready";
  viewerName: string;
  subjects: StudySubjectOption[];
  myNotes: NoteCard[];
  myUploads: UploadCard[];
  sharedNotes: NoteCard[];
  sharedUploads: UploadCard[];
  officialResources: OfficialResourceCard[];
};

export type ResourceLibraryModel =
  | ResourceLibraryReady
  | { mode: "guest"; officialResources: OfficialResourceCard[] }
  | { mode: "setup"; viewerName: string; officialResources: OfficialResourceCard[] };

export type ResourceDetailModel =
  | { mode: "guest" }
  | { mode: "missing" }
  | { mode: "ready"; resource: UploadCard; canManage: boolean; canReport: boolean };

export type NoteDetailModel =
  | { mode: "guest" }
  | { mode: "missing" }
  | { mode: "ready"; note: NoteCard; subjects: StudySubjectOption[]; canManage: boolean; canReport: boolean };

export type ModerationQueueItem = {
  entityType: ResourceEntityType;
  id: string;
  title: string;
  ownerLabel: string;
  status: "pending" | "reported";
  kindLabel: string;
  description: string | null;
  submittedAt: string;
};

export type ModerationReport = {
  id: string;
  entityType: ResourceEntityType;
  targetId: string;
  reason: ResourceReportReason;
  details: string | null;
  createdAt: string;
};

export type ModerationPageModel =
  | { mode: "denied" }
  | { mode: "ready"; role: string; queue: ModerationQueueItem[]; reports: ModerationReport[] };
