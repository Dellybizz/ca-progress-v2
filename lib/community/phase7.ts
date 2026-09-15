import "server-only";

import { getRequestAuthContext } from "@/lib/auth/server";
import { getServerAppRole } from "@/lib/authorization/server";
import type { AppRole } from "@/lib/authorization/roles";
import { getHotCommunityChannels } from "@/lib/data/d1/hot-screens";
import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import { getCommunityChannelModel, getCommunityHomeModel } from "./service";
import type {
  CommunityFeedFilter,
  CommunityMessage,
  CommunityMessagePage,
  CommunityVerificationBadge,
} from "./types";

const PAGE_SIZE = 30;
export const COMMUNITY_FEED_FILTERS: ReadonlyArray<{ id: CommunityFeedFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "verified", label: "Verified" },
  { id: "rankers", label: "Rankers" },
  { id: "high_scorers", label: "High Scorers" },
  { id: "saved", label: "Saved" },
];

const FILTERS = new Set(COMMUNITY_FEED_FILTERS.map((filter) => filter.id));
const VERIFICATION_MANAGER_ROLES = new Set<AppRole>(["admin", "owner", "parent_owner"]);
const BADGE_KINDS = new Set(["verified_result", "exemption", "score_70", "score_75", "score_80", "ranker", "air"]);

type ChannelRow = {
  id: string;
  slug: string;
  scope_type: string;
  subject_id: string | null;
};
type MessageRow = {
  id: string;
  sequence_id: number;
  channel_id: string;
  user_id: string;
  author_label: string;
  body: string;
  created_at: string;
  moderation_status: "active" | "moderated" | "deleted";
  reply_to_message_id: string | null;
  attached_resource_id: string | null;
};
type VerificationRow = {
  id: string;
  user_id: string;
  badge_kind: CommunityVerificationBadge["kind"];
  badge_value: string | null;
  evidence_source: string;
};
type DoubtRow = {
  id: string;
  session_id: string;
  community_message_id: string;
  subject_id: string | null;
  chapter_id: string | null;
  status: "open" | "answered" | "resolved";
};

function placeholders(count: number, offset = 1) {
  return Array.from({ length: count }, (_, index) => `?${index + offset}`).join(",");
}

function cleanSearch(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80).replace(/[%_]/g, "");
}

export function parseCommunityFeedFilter(value: string | null | undefined): CommunityFeedFilter {
  const filter = (value ?? "all") as CommunityFeedFilter;
  if (!FILTERS.has(filter)) throw new Error("Unsupported Community filter.");
  return filter;
}

function canManageVerification(role: AppRole) {
  return VERIFICATION_MANAGER_ROLES.has(role);
}

function verificationLabel(kind: CommunityVerificationBadge["kind"], value: string | null) {
  if (kind === "verified_result") return "Verified Result";
  if (kind === "exemption") return "Exemption";
  if (kind === "score_70") return "70%+";
  if (kind === "score_75") return "75%+";
  if (kind === "score_80") return "80%+";
  if (kind === "ranker") return "Ranker";
  return `AIR #${value ?? "—"}`;
}

async function visibleChannelsForViewer(userId: string | null, db: HotD1Database) {
  const rows = (await getHotCommunityChannels(userId, db)) as unknown as ChannelRow[];
  if (!userId) return rows.filter((channel) => channel.scope_type === "global");

  const profile = await db.prepare(`SELECT ca_level,group_choice,attempt_key FROM profiles WHERE user_id=?1 AND onboarding_completed_at IS NOT NULL LIMIT 1`)
    .bind(userId).first<{ ca_level: string | null; group_choice: string | null; attempt_key: string | null }>();
  if (!profile?.ca_level || !profile.attempt_key) return rows.filter((channel) => channel.scope_type === "global");

  const subjects = await db.prepare(`SELECT DISTINCT asm.subject_id
    FROM attempt_syllabus_map asm
    JOIN course_levels l ON l.id=asm.level_id
    JOIN course_groups g ON g.id=asm.group_id
    WHERE l.code=?1 AND asm.attempt_key=?2
      AND (?3='foundation' OR ?4 IN ('both','not_applicable') OR g.code=?4)`)
    .bind(profile.ca_level, profile.attempt_key, profile.ca_level, profile.group_choice ?? "not_applicable")
    .all<{ subject_id: string }>();
  const allowedSubjects = new Set((subjects.results ?? []).map((row) => row.subject_id));
  return rows.filter((channel) => channel.scope_type !== "subject" || (channel.subject_id && allowedSubjects.has(channel.subject_id)));
}

async function assertVisibleChannel(channelSlug: string, userId: string | null, db: HotD1Database) {
  const channels = await visibleChannelsForViewer(userId, db);
  const channel = channels.find((row) => row.slug === channelSlug);
  if (!channel) throw new Error(userId ? "Channel not found or access denied." : "Sign in to view this channel.");
  return { channel, channels };
}

async function assertVisibleMessage(messageId: string, userId: string, db: HotD1Database) {
  const channels = await visibleChannelsForViewer(userId, db);
  const allowedIds = new Set(channels.map((channel) => channel.id));
  const message = await db.prepare(`SELECT id,channel_id,user_id FROM community_messages WHERE id=?1 AND moderation_status='active' LIMIT 1`)
    .bind(messageId).first<{ id: string; channel_id: string; user_id: string }>();
  if (!message || !allowedIds.has(message.channel_id)) throw new Error("Message not found or access denied.");
  return message;
}

async function hydratePhase7Messages(rows: MessageRow[], viewerId: string | null, db: HotD1Database): Promise<CommunityMessage[]> {
  if (!rows.length) return [];
  const messageIds = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.user_id))];
  const replyIds = [...new Set(rows.map((row) => row.reply_to_message_id).filter((id): id is string => Boolean(id)))];
  const resourceIds = [...new Set(rows.map((row) => row.attached_resource_id).filter((id): id is string => Boolean(id)))];

  const statements = [
    db.prepare(`SELECT message_id,user_id,emoji FROM message_reactions WHERE message_id IN (${placeholders(messageIds.length)})`).bind(...messageIds),
    db.prepare(`SELECT message_id FROM pinned_messages WHERE message_id IN (${placeholders(messageIds.length)})`).bind(...messageIds),
    db.prepare(`SELECT id,user_id,badge_kind,badge_value,evidence_source FROM community_verifications WHERE status='active' AND user_id IN (${placeholders(authorIds.length)}) ORDER BY granted_at`).bind(...authorIds),
    db.prepare(`SELECT id,session_id,community_message_id,subject_id,chapter_id,status FROM study_session_doubts WHERE community_message_id IN (${placeholders(messageIds.length)})`).bind(...messageIds),
  ];
  if (replyIds.length) statements.push(db.prepare(`SELECT id,author_label,body FROM community_messages WHERE id IN (${placeholders(replyIds.length)})`).bind(...replyIds));
  if (resourceIds.length) statements.push(db.prepare(`SELECT id,title,original_filename,extension,owner_label FROM uploaded_resources WHERE id IN (${placeholders(resourceIds.length)}) AND visibility='shared' AND moderation_status='approved'`).bind(...resourceIds));
  if (viewerId) {
    statements.push(db.prepare(`SELECT message_id FROM community_saved_messages WHERE user_id=?1 AND message_id IN (${placeholders(messageIds.length, 2)})`).bind(viewerId, ...messageIds));
    statements.push(db.prepare(`SELECT followed_user_id FROM community_follows WHERE user_id=?1 AND followed_user_id IN (${placeholders(authorIds.length, 2)})`).bind(viewerId, ...authorIds));
  }
  const result = await db.batch(statements);
  let index = 0;
  const reactions = (result[index++]?.results ?? []) as Array<{ message_id: string; user_id: string; emoji: string }>;
  const pins = new Set(((result[index++]?.results ?? []) as Array<{ message_id: string }>).map((row) => row.message_id));
  const verifications = (result[index++]?.results ?? []) as VerificationRow[];
  const doubts = (result[index++]?.results ?? []) as DoubtRow[];
  const replies = replyIds.length ? (result[index++]?.results ?? []) as Array<{ id: string; author_label: string; body: string }> : [];
  const resources = resourceIds.length ? (result[index++]?.results ?? []) as Array<{ id: string; title: string; original_filename: string; extension: string; owner_label: string }> : [];
  const saved = viewerId ? new Set(((result[index++]?.results ?? []) as Array<{ message_id: string }>).map((row) => row.message_id)) : new Set<string>();
  const followed = viewerId ? new Set(((result[index++]?.results ?? []) as Array<{ followed_user_id: string }>).map((row) => row.followed_user_id)) : new Set<string>();

  const reactionMap = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const reaction of reactions) {
    const map = reactionMap.get(reaction.message_id) ?? new Map();
    const current = map.get(reaction.emoji) ?? { count: 0, mine: false };
    current.count += 1;
    if (viewerId && reaction.user_id === viewerId) current.mine = true;
    map.set(reaction.emoji, current);
    reactionMap.set(reaction.message_id, map);
  }
  const badgesByUser = new Map<string, CommunityVerificationBadge[]>();
  for (const row of verifications) {
    const current = badgesByUser.get(row.user_id) ?? [];
    current.push({ id: row.id, kind: row.badge_kind, label: verificationLabel(row.badge_kind, row.badge_value), evidenceSource: row.evidence_source });
    badgesByUser.set(row.user_id, current);
  }
  const doubtByMessage = new Map(doubts.map((row) => [row.community_message_id, row]));
  const replyById = new Map(replies.map((row) => [row.id, row]));
  const resourceById = new Map(resources.map((row) => [row.id, row]));

  return rows.map((row) => {
    const reply = row.reply_to_message_id ? replyById.get(row.reply_to_message_id) : null;
    const resource = row.attached_resource_id ? resourceById.get(row.attached_resource_id) : null;
    const doubt = doubtByMessage.get(row.id);
    return {
      id: row.id,
      sequence: Number(row.sequence_id),
      channelId: row.channel_id,
      userId: row.user_id,
      authorLabel: row.author_label,
      body: row.moderation_status === "active" ? row.body : "This message was removed by moderation.",
      createdAt: row.created_at,
      moderationStatus: row.moderation_status,
      replyTo: reply ? { id: reply.id, authorLabel: reply.author_label, body: reply.body } : null,
      attachment: resource ? { id: resource.id, title: resource.title, filename: resource.original_filename, extension: resource.extension, ownerLabel: resource.owner_label } : null,
      reactions: [...(reactionMap.get(row.id)?.entries() ?? [])].map(([emoji, value]) => ({ emoji: emoji as CommunityMessage["reactions"][number]["emoji"], count: value.count, reactedByViewer: value.mine })),
      isOwn: Boolean(viewerId && row.user_id === viewerId),
      isPinned: pins.has(row.id),
      verificationBadges: badgesByUser.get(row.user_id) ?? [],
      savedByViewer: saved.has(row.id),
      followedByViewer: followed.has(row.user_id),
      doubt: doubt ? { id: doubt.id, sessionId: doubt.session_id, subjectId: doubt.subject_id, chapterId: doubt.chapter_id, status: doubt.status, source: "study_session" as const } : null,
    };
  });
}

export async function getPhase7CommunityMessagePage(input: {
  channelSlug: string;
  cursor?: string | null;
  query?: string | null;
  filter?: string | null;
}): Promise<CommunityMessagePage> {
  const identity = (await getRequestAuthContext()).identity;
  const viewerId = identity?.id ?? null;
  const db = getHotD1Database();
  const { channel } = await assertVisibleChannel(input.channelSlug, viewerId, db);
  const filter = parseCommunityFeedFilter(input.filter);
  if (!viewerId && (filter === "following" || filter === "saved")) throw new Error("Sign in to use this Community filter.");

  const values: unknown[] = [channel.id];
  const where = ["m.channel_id=?1", "m.moderation_status IN ('active','moderated')"];
  const cursor = Number(input.cursor);
  if (Number.isSafeInteger(cursor) && cursor > 0) { values.push(cursor); where.push(`m.sequence_id<?${values.length}`); }
  const search = cleanSearch(input.query);
  if (search) { values.push(`%${search}%`); where.push(`m.body LIKE ?${values.length}`); }
  if (filter === "following") { values.push(viewerId); where.push(`EXISTS (SELECT 1 FROM community_follows f WHERE f.user_id=?${values.length} AND f.followed_user_id=m.user_id)`); }
  if (filter === "saved") { values.push(viewerId); where.push(`EXISTS (SELECT 1 FROM community_saved_messages s WHERE s.user_id=?${values.length} AND s.message_id=m.id)`); }
  if (filter === "verified") where.push(`EXISTS (SELECT 1 FROM community_verifications v WHERE v.user_id=m.user_id AND v.status='active')`);
  if (filter === "rankers") where.push(`EXISTS (SELECT 1 FROM community_verifications v WHERE v.user_id=m.user_id AND v.status='active' AND v.badge_kind IN ('ranker','air'))`);
  if (filter === "high_scorers") where.push(`EXISTS (SELECT 1 FROM community_verifications v WHERE v.user_id=m.user_id AND v.status='active' AND v.badge_kind IN ('score_70','score_75','score_80'))`);

  const rows = await db.prepare(`SELECT m.id,m.sequence_id,m.channel_id,m.user_id,m.author_label,m.body,m.created_at,m.moderation_status,m.reply_to_message_id,m.attached_resource_id
    FROM community_messages m WHERE ${where.join(" AND ")} ORDER BY m.sequence_id DESC LIMIT ${PAGE_SIZE + 1}`)
    .bind(...values).all<MessageRow>();
  const raw = (rows.results ?? []) as MessageRow[];
  const hasMore = raw.length > PAGE_SIZE;
  const pageRows = raw.slice(0, PAGE_SIZE);
  const messages = await hydratePhase7Messages(pageRows, viewerId, db);
  return { messages: messages.reverse(), nextCursor: hasMore && pageRows.length ? String(pageRows[pageRows.length - 1].sequence_id) : null, filter };
}

export async function getPhase7CommunityChannelModel(channelSlug: string) {
  const base = await getCommunityChannelModel(channelSlug);
  if (base.mode !== "ready") return base;
  const identity = (await getRequestAuthContext()).identity;
  const db = getHotD1Database();
  const visible = await visibleChannelsForViewer(identity?.id ?? null, db);
  if (!visible.some((channel) => channel.id === base.channel.id)) return { mode: "denied" as const, viewerName: base.viewerName };
  const page = await getPhase7CommunityMessagePage({ channelSlug, filter: "all" });
  const allowedIds = new Set(visible.map((channel) => channel.id));
  return {
    ...base,
    groups: base.groups.map((group) => ({ ...group, channels: group.channels.filter((channel) => allowedIds.has(channel.id)) })).filter((group) => group.channels.length),
    messages: page.messages,
    nextCursor: page.nextCursor,
    feedFilters: COMMUNITY_FEED_FILTERS,
  };
}

export async function getPhase7CommunityHomeModel() {
  const base = await getCommunityHomeModel();
  if (base.mode !== "ready") return base;
  const identity = (await getRequestAuthContext()).identity;
  const visible = await visibleChannelsForViewer(identity?.id ?? null, getHotD1Database());
  const allowedIds = new Set(visible.map((channel) => channel.id));
  const allowedSlugs = new Set(visible.map((channel) => channel.slug));
  const groups = base.groups.map((group) => ({ ...group, channels: group.channels.filter((channel) => allowedIds.has(channel.id)) })).filter((group) => group.channels.length);
  return { ...base, groups, notifications: base.notifications.filter((item) => allowedSlugs.has(item.channelKey)), totalUnread: groups.flatMap((group) => group.channels).reduce((sum, channel) => sum + channel.unreadCount, 0) };
}

export async function toggleCommunitySavedMessage(messageId: string) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Sign in to save Community messages.");
  const db = getHotD1Database();
  await assertVisibleMessage(messageId, identity.id, db);
  const existing = await db.prepare(`SELECT 1 AS present FROM community_saved_messages WHERE user_id=?1 AND message_id=?2 LIMIT 1`).bind(identity.id, messageId).first();
  if (existing) {
    await db.prepare(`DELETE FROM community_saved_messages WHERE user_id=?1 AND message_id=?2`).bind(identity.id, messageId).run();
    return { saved: false };
  }
  await db.prepare(`INSERT INTO community_saved_messages(user_id,message_id) VALUES (?1,?2)`).bind(identity.id, messageId).run();
  return { saved: true };
}

export async function toggleCommunityFollowFromMessage(messageId: string) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Sign in to follow Community members.");
  const db = getHotD1Database();
  const message = await assertVisibleMessage(messageId, identity.id, db);
  if (message.user_id === identity.id) throw new Error("You cannot follow yourself.");
  const existing = await db.prepare(`SELECT 1 AS present FROM community_follows WHERE user_id=?1 AND followed_user_id=?2 LIMIT 1`).bind(identity.id, message.user_id).first();
  if (existing) {
    await db.prepare(`DELETE FROM community_follows WHERE user_id=?1 AND followed_user_id=?2`).bind(identity.id, message.user_id).run();
    return { following: false, userId: message.user_id };
  }
  await db.prepare(`INSERT INTO community_follows(user_id,followed_user_id) VALUES (?1,?2)`).bind(identity.id, message.user_id).run();
  return { following: true, userId: message.user_id };
}

export type CommunityVerificationAdminModel = {
  role: AppRole;
  canManage: boolean;
  active: Array<{ id: string; userId: string; userLabel: string; badge: string; evidenceSource: string; grantedAt: string }>;
  audit: Array<{ id: string; action: string; targetUserId: string; actorRole: AppRole; reason: string | null; createdAt: string }>;
};

export async function getCommunityVerificationAdminModel(): Promise<CommunityVerificationAdminModel | null> {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) return null;
  const role = await getServerAppRole();
  if (role === "student") return null;
  const db = getHotD1Database();
  const [active, audit] = await db.batch([
    db.prepare(`SELECT v.id,v.user_id,v.badge_kind,v.badge_value,v.evidence_source,v.granted_at,COALESCE(NULLIF(trim(p.display_name),''),'Student') AS user_label
      FROM community_verifications v LEFT JOIN profiles p ON p.user_id=v.user_id WHERE v.status='active' ORDER BY v.granted_at DESC LIMIT 150`),
    db.prepare(`SELECT id,action,target_user_id,actor_role,reason,created_at FROM community_verification_audit ORDER BY created_at DESC LIMIT 150`),
  ]);
  return {
    role,
    canManage: canManageVerification(role),
    active: ((active?.results ?? []) as Array<{ id: string; user_id: string; badge_kind: CommunityVerificationBadge["kind"]; badge_value: string | null; evidence_source: string; granted_at: string; user_label: string }>).map((row) => ({ id: row.id, userId: row.user_id, userLabel: row.user_label, badge: verificationLabel(row.badge_kind, row.badge_value), evidenceSource: row.evidence_source, grantedAt: row.granted_at })),
    audit: ((audit?.results ?? []) as Array<{ id: string; action: string; target_user_id: string; actor_role: AppRole; reason: string | null; created_at: string }>).map((row) => ({ id: row.id, action: row.action, targetUserId: row.target_user_id, actorRole: row.actor_role, reason: row.reason, createdAt: row.created_at })),
  };
}

export async function manageCommunityVerification(input: {
  action: "grant" | "revoke";
  targetUserId?: string | null;
  verificationId?: string | null;
  badgeKind?: string | null;
  badgeValue?: string | null;
  evidenceSource?: string | null;
  evidenceReference?: string | null;
  reason?: string | null;
}) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Admin authentication required.");
  const role = await getServerAppRole();
  if (!canManageVerification(role)) throw new Error("Admin, owner or parent owner access is required to manage verification.");
  const db = getHotD1Database();

  if (input.action === "grant") {
    const targetUserId = input.targetUserId?.trim() ?? "";
    const badgeKind = input.badgeKind?.trim() ?? "";
    const badgeValue = input.badgeValue?.trim().slice(0, 40) || null;
    const evidenceSource = input.evidenceSource?.trim().slice(0, 160) ?? "";
    const evidenceReference = input.evidenceReference?.trim().slice(0, 500) ?? "";
    if (!targetUserId || !BADGE_KINDS.has(badgeKind)) throw new Error("A valid student and verification badge are required.");
    if (badgeKind === "air" && !/^\d{1,4}$/.test(badgeValue ?? "")) throw new Error("AIR verification requires a numeric rank.");
    if (evidenceSource.length < 2 || evidenceReference.length < 2) throw new Error("Verification requires an evidence source and reference.");
    const user = await db.prepare(`SELECT user_id FROM app_users WHERE user_id=?1 AND account_state='active' LIMIT 1`).bind(targetUserId).first();
    if (!user) throw new Error("Student account not found.");
    const duplicate = await db.prepare(`SELECT id FROM community_verifications WHERE user_id=?1 AND badge_kind=?2 AND COALESCE(badge_value,'')=COALESCE(?3,'') AND status='active' LIMIT 1`).bind(targetUserId, badgeKind, badgeValue).first();
    if (duplicate) throw new Error("That verification is already active.");
    const id = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO community_verifications(id,user_id,badge_kind,badge_value,evidence_source,evidence_reference,review_note,status,granted_by,granted_by_role)
        VALUES (?1,?2,?3,?4,?5,?6,?7,'active',?8,?9)`).bind(id, targetUserId, badgeKind, badgeValue, evidenceSource, evidenceReference, input.reason?.trim().slice(0, 500) || null, identity.id, role),
      db.prepare(`INSERT INTO community_verification_audit(id,verification_id,target_user_id,actor_user_id,actor_role,action,evidence_source,evidence_reference,reason)
        VALUES (?1,?2,?3,?4,?5,'grant',?6,?7,?8)`).bind(auditId, id, targetUserId, identity.id, role, evidenceSource, evidenceReference, input.reason?.trim().slice(0, 500) || null),
      db.prepare(`INSERT INTO moderation_actions(id,actor_user_id,actor_role,action_type,target_user_id,reason,metadata)
        VALUES (?1,?2,?3,'grant_verification',?4,?5,?6)`).bind(crypto.randomUUID(), identity.id, role, targetUserId, input.reason?.trim().slice(0, 500) || "Evidence-backed Community verification", JSON.stringify({ verificationId: id, badgeKind, badgeValue, evidenceSource })),
    ]);
    return { id, action: "grant" as const };
  }

  const verificationId = input.verificationId?.trim() ?? "";
  if (!verificationId) throw new Error("Verification ID is required.");
  const verification = await db.prepare(`SELECT id,user_id,status,evidence_source,evidence_reference FROM community_verifications WHERE id=?1 LIMIT 1`).bind(verificationId).first<{ id: string; user_id: string; status: string; evidence_source: string; evidence_reference: string }>();
  if (!verification || verification.status !== "active") throw new Error("Active verification not found.");
  const reason = input.reason?.trim().slice(0, 500) || "Verification revoked after review";
  await db.batch([
    db.prepare(`UPDATE community_verifications SET status='revoked',revoked_by=?1,revoked_by_role=?2,revoked_reason=?3,revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?4 AND status='active'`).bind(identity.id, role, reason, verificationId),
    db.prepare(`INSERT INTO community_verification_audit(id,verification_id,target_user_id,actor_user_id,actor_role,action,evidence_source,evidence_reference,reason)
      VALUES (?1,?2,?3,?4,?5,'revoke',?6,?7,?8)`).bind(crypto.randomUUID(), verificationId, verification.user_id, identity.id, role, verification.evidence_source, verification.evidence_reference, reason),
    db.prepare(`INSERT INTO moderation_actions(id,actor_user_id,actor_role,action_type,target_user_id,reason,metadata)
      VALUES (?1,?2,?3,'revoke_verification',?4,?5,?6)`).bind(crypto.randomUUID(), identity.id, role, verification.user_id, reason, JSON.stringify({ verificationId })),
  ]);
  return { id: verificationId, action: "revoke" as const };
}
