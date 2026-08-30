import type { AppRole } from "@/lib/authorization/roles";

export type CommunityChannelKind = "general" | "announcements" | "resources" | "result_talk" | "general_talk" | "doubts";
export type CommunityScope = "global" | "level" | "subject";
export type CommunityReportReason = "spam" | "harassment" | "misinformation" | "off_topic" | "other";
export type CommunityReactionEmoji = "👍" | "❤️" | "🎯" | "👏" | "💡" | "✅";
export type CommunityNotificationType = "mention" | "reply" | "announcement";

export type CommunityChannel = {
  id: string;
  key: string;
  slug: string;
  scope: CommunityScope;
  kind: CommunityChannelKind;
  title: string;
  description: string;
  levelId: string | null;
  subjectId: string | null;
  canWrite: boolean;
  unreadCount: number;
  latestSequence: number | null;
  latestBody: string | null;
  latestAuthor: string | null;
  latestAt: string | null;
};

export type CommunityChannelGroup = {
  label: string;
  channels: CommunityChannel[];
};

export type CommunityReaction = {
  emoji: CommunityReactionEmoji;
  count: number;
  reactedByViewer: boolean;
};

export type CommunityResourceAttachment = {
  id: string;
  title: string;
  filename: string;
  extension: string;
  ownerLabel: string;
};

export type CommunityReplyPreview = {
  id: string;
  authorLabel: string;
  body: string;
};

export type CommunityMessage = {
  id: string;
  sequence: number;
  channelId: string;
  userId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  moderationStatus: "active" | "moderated" | "deleted";
  replyTo: CommunityReplyPreview | null;
  attachment: CommunityResourceAttachment | null;
  reactions: CommunityReaction[];
  isOwn: boolean;
  isPinned: boolean;
};

export type CommunityMemberOption = { userId: string; label: string };
export type CommunityResourceOption = { id: string; title: string; extension: string; ownerLabel: string };
export type CommunityNotification = {
  id: string;
  type: CommunityNotificationType;
  channelKey: string;
  channelTitle: string;
  messageId: string;
  createdAt: string;
  readAt: string | null;
};

export type CommunityHomeModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | {
      mode: "ready";
      viewerName: string;
      role: AppRole;
      groups: CommunityChannelGroup[];
      notifications: CommunityNotification[];
      totalUnread: number;
    };

export type CommunityChannelModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | { mode: "denied"; viewerName: string }
  | {
      mode: "ready";
      viewerId: string;
      viewerName: string;
      role: AppRole;
      canModerate: boolean;
      channel: CommunityChannel;
      groups: CommunityChannelGroup[];
      messages: CommunityMessage[];
      nextCursor: string | null;
      pinned: CommunityMessage | null;
      members: CommunityMemberOption[];
      resources: CommunityResourceOption[];
      activeBlock: { reason: string; endsAt: string; channelSpecific: boolean } | null;
    };

export type CommunityMessagePage = { messages: CommunityMessage[]; nextCursor: string | null };

export type CommunityModerationReport = {
  id: string;
  reason: CommunityReportReason;
  details: string | null;
  createdAt: string;
  channelTitle: string;
  message: CommunityMessage;
};
export type CommunityModerationAction = {
  id: string;
  actionType: string;
  actorRole: AppRole;
  reason: string | null;
  createdAt: string;
  channelTitle: string | null;
  messageId: string | null;
  targetUserId: string | null;
};
export type CommunityBlock = {
  id: string;
  userId: string;
  userLabel: string;
  channelId: string | null;
  channelTitle: string | null;
  reason: string;
  startsAt: string;
  endsAt: string;
};
export type CommunityModerationModel =
  | { mode: "denied" }
  | {
      mode: "ready";
      role: AppRole;
      reports: CommunityModerationReport[];
      actions: CommunityModerationAction[];
      blocks: CommunityBlock[];
    };
