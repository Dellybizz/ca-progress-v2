export type NoteTopicOption = {
  id: string;
  title: string;
  kind: string;
  unitNumber: string | null;
};

export type NoteChapterOption = {
  id: string;
  number: string;
  title: string;
  topics: NoteTopicOption[];
};

export type NoteSubjectOption = {
  id: string;
  slug: string;
  title: string;
  chapters: NoteChapterOption[];
};

export type CommunityNoteDraft = {
  messageId: string;
  channelId: string;
  channelSlug: string;
  answer: string;
  authorLabel: string;
  question: string | null;
  createdAt: string;
  discussionPath: string;
  subjectId: string | null;
  suggestedTitle: string;
};

export type NoteSourceAttribution = {
  type: "manual" | "community";
  messageId: string | null;
  channelId: string | null;
  authorLabel: string | null;
  question: string | null;
  answer: string | null;
  createdAt: string | null;
  discussionPath: string | null;
};

export type NotePhase6Extra = {
  topicId: string | null;
  topicTitle: string | null;
  documentJson: string | null;
  source: NoteSourceAttribution | null;
  resourceIds: string[];
};
