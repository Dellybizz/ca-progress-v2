import "server-only";

import { getProfileForUser, getRequestAuthContext } from "@/lib/auth/server";
import { getServerAppRole } from "@/lib/authorization/server";
import { isPrivilegedRole } from "@/lib/authorization/roles";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";
import { createHotCommunityMessage, getHotCommunityChannel, getHotCommunityMessages, getHotCommunityChannels, markHotCommunityRead, moderateHotCommunity, reportHotCommunityMessage, toggleHotCommunityReaction } from "@/lib/data/d1/hot-screens";
import type {
  CommunityBlock,
  CommunityChannel,
  CommunityChannelGroup,
  CommunityChannelModel,
  CommunityHomeModel,
  CommunityMessage,
  CommunityMessagePage,
  CommunityModerationAction,
  CommunityModerationModel,
  CommunityModerationReport,
  CommunityNotification,
  CommunityReaction,
  CommunityReactionEmoji,
  CommunityResourceAttachment,
} from "./types";

type ChannelRow = Database["public"]["Tables"]["community_channels"]["Row"];
type MessageRow = Database["public"]["Tables"]["community_messages"]["Row"];
type ReactionRow = Database["public"]["Tables"]["message_reactions"]["Row"];
type PinRow = Database["public"]["Tables"]["pinned_messages"]["Row"];
type ResourceRow = Database["public"]["Tables"]["uploaded_resources"]["Row"];
type NotificationRow = Database["public"]["Tables"]["community_notifications"]["Row"];
type ReportRow = Database["public"]["Tables"]["message_reports"]["Row"];
type ActionRow = Database["public"]["Tables"]["moderation_actions"]["Row"];
type BlockRow = Database["public"]["Tables"]["chat_blocks"]["Row"];

const PAGE_SIZE = 30;

function viewerLabel(name: string | null, email: string | null, phone: string | null) {
  return name?.trim() || email || phone || "Student";
}

function profileReady(profile: Awaited<ReturnType<typeof getProfileForUser>>) {
  return Boolean(profile?.onboarding_completed_at && isCALevel(profile.ca_level) && isGroupChoice(profile.group_choice));
}

function cleanSearch(value: string | null | undefined) {
  const text = value?.trim().replace(/\s+/g, " ") ?? "";
  return text.slice(0, 80).replace(/[%_]/g, "");
}

function channelDto(row: Database["public"]["Functions"]["phase10_list_channels"]["Returns"][number]): CommunityChannel {
  return {
    id: row.id,
    key: row.channel_key,
    slug: row.slug,
    scope: row.scope_type as CommunityChannel["scope"],
    kind: row.channel_kind as CommunityChannel["kind"],
    title: row.title,
    description: row.description,
    levelId: row.level_id,
    subjectId: row.subject_id,
    canWrite: row.can_write,
    unreadCount: Number(row.unread_count ?? 0),
    latestSequence: row.latest_sequence === null ? null : Number(row.latest_sequence),
    latestBody: row.latest_body,
    latestAuthor: row.latest_author,
    latestAt: row.latest_at,
  };
}

function groupChannels(channels: CommunityChannel[], levelLabel: string) {
  const groups: CommunityChannelGroup[] = [];
  const general = channels.filter((channel) => channel.scope === "global");
  const level = channels.filter((channel) => channel.scope === "level");
  const doubts = channels.filter((channel) => channel.scope === "subject");
  if (general.length) groups.push({ label: "Community", channels: general });
  if (level.length) groups.push({ label: levelLabel, channels: level });
  if (doubts.length) groups.push({ label: "Doubts", channels: doubts });
  return groups;
}

async function publicCommunityContext() {
  const supabase = createAdminSupabaseClient();
  if (isCloudflareDataRuntime()) {
    const channels = (await getHotCommunityChannels(null)).map((row) => channelDto(row as never)).map((channel) => ({ ...channel, canWrite: false, unreadCount: 0 }));
    return { mode: "guest" as const, supabase, channels, groups: groupChannels(channels, "Community") };
  }
  const [channelsResult, messagesResult] = await Promise.all([
    supabase.from("community_channels").select("id,channel_key,slug,scope_type,channel_kind,title,description,level_id,subject_id,write_policy,sort_order,is_active").eq("is_active", true).eq("scope_type", "global").order("sort_order").order("title"),
    supabase.from("community_messages").select("id,sequence_id,channel_id,user_id,author_label,body,created_at,moderation_status,reply_to_message_id,attached_resource_id").eq("moderation_status", "active").order("sequence_id", { ascending: false }).limit(60),
  ]);
  const error = channelsResult.error || messagesResult.error;
  if (error) throw new Error(`Public Community could not be loaded: ${error.message}`);
  const latestByChannel = new Map<string, MessageRow>();
  for (const row of (messagesResult.data ?? []) as MessageRow[]) {
    if (!latestByChannel.has(row.channel_id)) latestByChannel.set(row.channel_id, row);
  }
  const channels = ((channelsResult.data ?? []) as ChannelRow[]).map((row) => {
    const latest = latestByChannel.get(row.id);
    return {
      id: row.id,
      key: row.channel_key,
      slug: row.slug,
      scope: row.scope_type as CommunityChannel["scope"],
      kind: row.channel_kind as CommunityChannel["kind"],
      title: row.title,
      description: row.description,
      levelId: row.level_id,
      subjectId: row.subject_id,
      canWrite: false,
      unreadCount: 0,
      latestSequence: latest ? Number(latest.sequence_id) : null,
      latestBody: latest?.body ?? null,
      latestAuthor: latest?.author_label ?? null,
      latestAt: latest?.created_at ?? null,
    } satisfies CommunityChannel;
  });
  return { mode: "guest" as const, supabase, channels, groups: groupChannels(channels, "Community") };
}

async function baseCommunityContext() {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) return publicCommunityContext();
  const profile = await getProfileForUser(identity.id);
  const viewerName = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!profileReady(profile)) return { mode: "setup" as const, viewerName };
  const supabase = await createServerSupabaseClient();
  if (isCloudflareDataRuntime()) {
    const [directRows, levelResult, role] = await Promise.all([
      getHotCommunityChannels(identity.id),
      supabase.from("course_levels").select("name,code").eq("code", profile!.ca_level!).maybeSingle(),
      getServerAppRole(),
    ]);
    const channels = directRows.map((row) => channelDto(row as never));
    const levelLabel = levelResult.data?.name ?? profile!.ca_level ?? "Your level";
    return { mode: "ready" as const, identity, profile: profile!, viewerName, role, channels, groups: groupChannels(channels, levelLabel), supabase };
  }
  const [channelsResult, levelResult, role] = await Promise.all([
    supabase.rpc("phase10_list_channels"),
    supabase.from("course_levels").select("name,code").eq("code", profile!.ca_level!).maybeSingle(),
    getServerAppRole(),
  ]);
  if (channelsResult.error) throw new Error(`Community channels could not be loaded: ${channelsResult.error.message}`);
  const channels = (channelsResult.data ?? []).map(channelDto);
  const levelLabel = levelResult.data?.name ?? profile!.ca_level ?? "Your level";
  return { mode: "ready" as const, identity, profile: profile!, viewerName, role, channels, groups: groupChannels(channels, levelLabel), supabase };
}

export async function getCommunityChannelAccess(channelSlug: string): Promise<{ allowed: boolean; status: number; reason: string }> {
  const context = await baseCommunityContext();
  if (context.mode === "setup") return { allowed: false, status: 403, reason: "Complete your academic profile first." };
  const channel = context.channels.find((item) => item.slug === channelSlug);
  if (!channel) return { allowed: false, status: 404, reason: "Community channel not found." };
  return { allowed: true, status: 101, reason: "" };
}

export async function getCommunityComposerOptions(channelSlug: string) {
  const context = await baseCommunityContext();
  if (context.mode !== "ready") throw new Error("Community composer options are unavailable.");
  const channel = context.channels.find((item) => item.slug === channelSlug);
  if (!channel) throw new Error("Community channel not found.");
  const [memberResult, resourceResult] = await Promise.all([
    context.supabase.rpc("phase10_list_channel_members", { p_channel_key: channel.key, p_limit: 120 }),
    context.supabase.from("uploaded_resources").select("id,title,extension,owner_label").eq("visibility", "shared").eq("moderation_status", "approved").order("published_at", { ascending: false }).limit(80),
  ]);
  const error = memberResult.error || resourceResult.error;
  if (error) throw new Error(`Community composer data could not be loaded: ${error.message}`);
  return {
    members: (memberResult.data ?? []).filter((row) => row.user_id !== context.identity.id).map((row) => ({ userId: row.user_id, label: row.label })),
    resources: ((resourceResult.data ?? []) as Pick<ResourceRow, "id" | "title" | "extension" | "owner_label">[]).map((row) => ({ id: row.id, title: row.title, extension: row.extension, ownerLabel: row.owner_label })),
  };
}

async function mapNotifications(
  rows: NotificationRow[],
  channels: CommunityChannel[],
): Promise<CommunityNotification[]> {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  return rows.flatMap((row) => {
    const channel = byId.get(row.channel_id);
    if (!channel) return [];
    return [{ id: row.id, type: row.notification_type as CommunityNotification["type"], channelKey: channel.slug, channelTitle: channel.title, messageId: row.message_id, createdAt: row.created_at, readAt: row.read_at }];
  });
}

export async function getCommunityHomeModel(): Promise<CommunityHomeModel> {
  const context = await baseCommunityContext();
  if (context.mode === "guest") {
    return { mode: "ready", viewerName: "Guest", role: "student", groups: context.groups, notifications: [], totalUnread: 0 };
  }
  if (context.mode === "setup") return { mode: "setup", viewerName: context.viewerName };
  const notifications = await context.supabase
    .from("community_notifications")
    .select("id,channel_id,notification_type,message_id,created_at,read_at")
    .eq("user_id", context.identity.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (notifications.error) throw new Error(`Community notifications could not be loaded: ${notifications.error.message}`);
  return {
    mode: "ready",
    viewerName: context.viewerName,
    role: context.role,
    groups: context.groups,
    notifications: await mapNotifications((notifications.data ?? []) as NotificationRow[], context.channels),
    totalUnread: context.channels.reduce((sum, channel) => sum + channel.unreadCount, 0),
  };
}

function reactionMap(rows: ReactionRow[], viewerId: string) {
  const byMessage = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const row of rows) {
    const message = byMessage.get(row.message_id) ?? new Map();
    const current = message.get(row.emoji) ?? { count: 0, mine: false };
    current.count += 1;
    if (row.user_id === viewerId) current.mine = true;
    message.set(row.emoji, current);
    byMessage.set(row.message_id, message);
  }
  return byMessage;
}

function attachmentDto(row: ResourceRow): CommunityResourceAttachment {
  return { id: row.id, title: row.title, filename: row.original_filename, extension: row.extension, ownerLabel: row.owner_label };
}

async function hydrateMessages(
  supabase: SupabaseClient<Database>,
  rows: MessageRow[],
  viewerId: string,
): Promise<CommunityMessage[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const replyIds = [...new Set(rows.map((row) => row.reply_to_message_id).filter((id): id is string => Boolean(id)))];
  const resourceIds = [...new Set(rows.map((row) => row.attached_resource_id).filter((id): id is string => Boolean(id)))];
  const [reactions, pins, replies, resources] = await Promise.all([
    supabase.from("message_reactions").select("message_id,user_id,emoji").in("message_id", ids),
    supabase.from("pinned_messages").select("message_id").in("message_id", ids),
    replyIds.length ? supabase.from("community_messages").select("id,author_label,body").in("id", replyIds) : Promise.resolve({ data: [], error: null }),
    resourceIds.length ? supabase.from("uploaded_resources").select("id,title,original_filename,extension,owner_label").in("id", resourceIds).eq("visibility", "shared").eq("moderation_status", "approved") : Promise.resolve({ data: [], error: null }),
  ]);
  const error = reactions.error || pins.error || replies.error || resources.error;
  if (error) throw new Error(`Community message details could not be loaded: ${error.message}`);
  const reactionByMessage = reactionMap((reactions.data ?? []) as ReactionRow[], viewerId);
  const pinned = new Set(((pins.data ?? []) as PinRow[]).map((row) => row.message_id));
  const replyById = new Map(((replies.data ?? []) as { id: string; author_label: string; body: string }[]).map((row) => [row.id, row]));
  const resourceById = new Map(((resources.data ?? []) as ResourceRow[]).map((row) => [row.id, row]));
  return rows.map((row) => {
    const reactionRows: CommunityReaction[] = [...(reactionByMessage.get(row.id)?.entries() ?? [])].map(([emoji, value]) => ({ emoji: emoji as CommunityReactionEmoji, count: value.count, reactedByViewer: value.mine }));
    const reply = row.reply_to_message_id ? replyById.get(row.reply_to_message_id) : null;
    const resource = row.attached_resource_id ? resourceById.get(row.attached_resource_id) : null;
    return {
      id: row.id,
      sequence: Number(row.sequence_id),
      channelId: row.channel_id,
      userId: row.user_id,
      authorLabel: row.author_label,
      body: row.moderation_status === "active" ? row.body : "This message was removed by moderation.",
      createdAt: row.created_at,
      moderationStatus: row.moderation_status as CommunityMessage["moderationStatus"],
      replyTo: reply ? { id: reply.id, authorLabel: reply.author_label, body: reply.body } : null,
      attachment: resource ? attachmentDto(resource) : null,
      reactions: reactionRows,
      isOwn: row.user_id === viewerId,
      isPinned: pinned.has(row.id),
    };
  });
}

export async function getCommunityMessagePage(options: { channelSlug: string; cursor?: string | null; query?: string | null }): Promise<CommunityMessagePage> {
  const identity = (await getRequestAuthContext()).identity;
  const supabase = identity ? await createServerSupabaseClient() : createAdminSupabaseClient();
  const channel = isCloudflareDataRuntime() ? { data: await getHotCommunityChannel(options.channelSlug), error: null } : await supabase.from("community_channels").select("id,channel_key,slug,scope_type,channel_kind,title,description,level_id,subject_id,write_policy,sort_order,is_active").eq("slug", options.channelSlug).eq("is_active", true).maybeSingle();
  if (!identity && channel.data?.scope_type !== "global") throw new Error("Sign in to view this channel.");
  if (channel.error) throw new Error(`Community channel could not be loaded: ${channel.error.message}`);
  if (!channel.data) throw new Error("Channel not found or access denied.");
  let query = supabase
    .from("community_messages")
    .select("id,sequence_id,channel_id,user_id,author_label,body,created_at,moderation_status,reply_to_message_id,attached_resource_id")
    .eq("channel_id", channel.data.id)
    .in("moderation_status", ["active", "moderated"])
    .order("sequence_id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  const cursor = Number(options.cursor);
  if (Number.isSafeInteger(cursor) && cursor > 0) query = query.lt("sequence_id", cursor);
  const search = cleanSearch(options.query);
  if (search) query = query.ilike("body", `%${search}%`);
  const result = isCloudflareDataRuntime() ? { data: await getHotCommunityMessages(channel.data.id, Number(options.cursor), cleanSearch(options.query), PAGE_SIZE), error: null } : await query;
  if (result.error) throw new Error(`Messages could not be loaded: ${result.error.message}`);
  const raw = (result.data ?? []) as MessageRow[];
  const hasMore = raw.length > PAGE_SIZE;
  const pageRows = raw.slice(0, PAGE_SIZE);
  const messages = await hydrateMessages(supabase, pageRows, identity?.id ?? "");
  return { messages: messages.reverse(), nextCursor: hasMore && pageRows.length ? String(pageRows[pageRows.length - 1].sequence_id) : null };
}

async function pinnedMessage(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  channelId: string,
  viewerId: string,
) {
  const pin = await supabase.from("pinned_messages").select("message_id,pinned_at").eq("channel_id", channelId).order("pinned_at", { ascending: false }).limit(1).maybeSingle();
  if (pin.error) throw new Error(`Pinned message could not be loaded: ${pin.error.message}`);
  if (!pin.data) return null;
  const message = await supabase.from("community_messages").select("id,sequence_id,channel_id,user_id,author_label,body,created_at,moderation_status,reply_to_message_id,attached_resource_id").eq("id", pin.data.message_id).maybeSingle();
  if (message.error || !message.data) return null;
  return (await hydrateMessages(supabase, [message.data as MessageRow], viewerId))[0] ?? null;
}

export async function getCommunityChannelModel(channelSlug: string): Promise<CommunityChannelModel> {
  const context = await baseCommunityContext();
  if (context.mode === "guest") {
    const channel = context.channels.find((item) => item.slug === channelSlug);
    if (!channel) return { mode: "denied", viewerName: "Guest" };
    const page = await getCommunityMessagePage({ channelSlug });
    return {
      mode: "ready",
      viewerId: "",
      viewerName: "Guest",
      role: "student",
      canModerate: false,
      channel,
      groups: context.groups,
      messages: page.messages,
      nextCursor: page.nextCursor,
      pinned: null,
      members: [],
      resources: [],
      activeBlock: null,
    };
  }
  if (context.mode === "setup") return { mode: "setup", viewerName: context.viewerName };
  const channel = context.channels.find((item) => item.slug === channelSlug);
  if (!channel) return { mode: "denied", viewerName: context.viewerName };
  const page = await getCommunityMessagePage({ channelSlug });
  const [blockResult, pinned] = await Promise.all([
    context.supabase.from("chat_blocks").select("id,user_id,channel_id,reason,ends_at").eq("user_id", context.identity.id).gt("ends_at", new Date().toISOString()).order("ends_at", { ascending: false }).limit(4),
    pinnedMessage(context.supabase, channel.id, context.identity.id),
  ]);
  if (blockResult.error) throw new Error(`Community access data could not be loaded: ${blockResult.error.message}`);
  const blockRows = (blockResult.data ?? []) as BlockRow[];
  const block = blockRows.find((row) => row.channel_id === null || row.channel_id === channel.id) ?? null;
  return {
    mode: "ready",
    viewerId: context.identity.id,
    viewerName: context.viewerName,
    role: context.role,
    canModerate: isPrivilegedRole(context.role),
    channel,
    groups: context.groups,
    messages: page.messages,
    nextCursor: page.nextCursor,
    pinned,
    members: [],
    resources: [],
    activeBlock: block ? { reason: block.reason, endsAt: block.ends_at, channelSpecific: Boolean(block.channel_id) } : null,
  };
}

export async function createCommunityMessage(input: { channelSlug: string; body: string; replyToId?: string | null; resourceId?: string | null; mentionUserIds?: string[] }) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Sign in to send a message.");
  if (isCloudflareDataRuntime()) {
    const profile = await getProfileForUser(identity.id);
    return createHotCommunityMessage({
      channelSlug: input.channelSlug,
      userId: identity.id,
      authorLabel: viewerLabel(profile?.display_name ?? null, identity.email, identity.phone),
      body: input.body,
      replyToId: input.replyToId ?? null,
      resourceId: input.resourceId ?? null,
      mentionUserIds: input.mentionUserIds ?? [],
    });
  }
  const supabase = await createServerSupabaseClient();
  const channel = await supabase.from("community_channels").select("channel_key").eq("slug", input.channelSlug).eq("is_active", true).maybeSingle();
  if (channel.error || !channel.data) throw new Error("Channel not found or access denied.");
  const result = await supabase.rpc("phase10_create_message", {
    p_channel_key: channel.data.channel_key,
    p_body: input.body,
    p_reply_to_message_id: input.replyToId ?? null,
    p_attached_resource_id: input.resourceId ?? null,
    p_mention_user_ids: input.mentionUserIds ?? [],
  });
  if (result.error) throw new Error(result.error.message || "Message could not be sent.");
  return { id: result.data };
}

export async function markCommunityRead(channelSlug: string, sequence?: number | null) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Sign in to update read state.");
  if (isCloudflareDataRuntime()) return markHotCommunityRead(channelSlug, identity.id, sequence ?? null);
  const supabase = await createServerSupabaseClient();
  const channel = await supabase.from("community_channels").select("channel_key").eq("slug", channelSlug).eq("is_active", true).maybeSingle();
  if (channel.error || !channel.data) throw new Error("Channel not found or access denied.");
  const result = await supabase.rpc("phase10_mark_read", { p_channel_key: channel.data.channel_key, p_sequence_id: sequence ?? null });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function toggleCommunityReaction(messageId: string, emoji: string) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Sign in to react.");
  if (isCloudflareDataRuntime()) return toggleHotCommunityReaction(messageId, identity.id, emoji);
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("phase10_toggle_reaction", { p_message_id: messageId, p_emoji: emoji });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function reportCommunityMessage(messageId: string, reason: string, details?: string | null) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Sign in to report a message.");
  if (isCloudflareDataRuntime()) return reportHotCommunityMessage(messageId, identity.id, reason, details ?? null);
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("phase10_report_message", { p_message_id: messageId, p_reason: reason, p_details: details ?? null });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function moderateCommunity(input: { action: string; messageId?: string | null; reportId?: string | null; targetUserId?: string | null; channelId?: string | null; reason?: string | null; durationMinutes?: number | null }) {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) throw new Error("Moderator authentication required.");
  const role = await getServerAppRole();
  if (!isPrivilegedRole(role)) throw new Error("Moderator access required.");
  if (isCloudflareDataRuntime()) {
    return moderateHotCommunity({
      actorUserId: identity.id,
      actorRole: role,
      action: input.action,
      messageId: input.messageId ?? null,
      reportId: input.reportId ?? null,
      targetUserId: input.targetUserId ?? null,
      channelId: input.channelId ?? null,
      reason: input.reason ?? null,
      durationMinutes: input.durationMinutes ?? null,
    });
  }
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("phase10_moderate", {
    p_action: input.action,
    p_message_id: input.messageId ?? null,
    p_report_id: input.reportId ?? null,
    p_target_user_id: input.targetUserId ?? null,
    p_channel_id: input.channelId ?? null,
    p_reason: input.reason ?? null,
    p_duration_minutes: input.durationMinutes ?? null,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function moderationMessage(row: MessageRow, channelTitle: string, attachment: ResourceRow | null): CommunityMessage {
  return {
    id: row.id,
    sequence: Number(row.sequence_id),
    channelId: row.channel_id,
    userId: row.user_id,
    authorLabel: row.author_label,
    body: row.body,
    createdAt: row.created_at,
    moderationStatus: row.moderation_status as CommunityMessage["moderationStatus"],
    replyTo: null,
    attachment: attachment ? attachmentDto(attachment) : null,
    reactions: [],
    isOwn: false,
    isPinned: false,
  };
}

export async function getCommunityModerationModel(): Promise<CommunityModerationModel> {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) return { mode: "denied" };
  const role = await getServerAppRole();
  if (!isPrivilegedRole(role)) return { mode: "denied" };
  const admin = createAdminSupabaseClient();
  const [reportsResult, actionsResult, blocksResult, channelsResult] = await Promise.all([
    admin.from("message_reports").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(150),
    admin.from("moderation_actions").select("*").order("created_at", { ascending: false }).limit(150),
    admin.from("chat_blocks").select("*").gt("ends_at", new Date().toISOString()).order("ends_at", { ascending: true }).limit(150),
    admin.from("community_channels").select("*").limit(500),
  ]);
  const error = reportsResult.error || actionsResult.error || blocksResult.error || channelsResult.error;
  if (error) throw new Error(`Community moderation data could not be loaded: ${error.message}`);
  const reports = (reportsResult.data ?? []) as ReportRow[];
  const messageIds = [...new Set(reports.map((row) => row.message_id))];
  const messagesResult = messageIds.length ? await admin.from("community_messages").select("*").in("id", messageIds) : { data: [], error: null };
  if (messagesResult.error) throw new Error(`Reported messages could not be loaded: ${messagesResult.error.message}`);
  const messageRows = (messagesResult.data ?? []) as MessageRow[];
  const resourceIds = [...new Set(messageRows.map((row) => row.attached_resource_id).filter((id): id is string => Boolean(id)))];
  const resourcesResult = resourceIds.length ? await admin.from("uploaded_resources").select("*").in("id", resourceIds) : { data: [], error: null };
  if (resourcesResult.error) throw new Error(`Reported resource references could not be loaded: ${resourcesResult.error.message}`);
  const userIds = [...new Set(((blocksResult.data ?? []) as BlockRow[]).map((row) => row.user_id))];
  const profilesResult = userIds.length ? await admin.from("profiles").select("user_id,display_name").in("user_id", userIds) : { data: [], error: null };
  if (profilesResult.error) throw new Error(`Blocked member labels could not be loaded: ${profilesResult.error.message}`);
  const channelById = new Map(((channelsResult.data ?? []) as ChannelRow[]).map((row) => [row.id, row.title]));
  const messageById = new Map(messageRows.map((row) => [row.id, row]));
  const resourceById = new Map(((resourcesResult.data ?? []) as ResourceRow[]).map((row) => [row.id, row]));
  const profileById = new Map(((profilesResult.data ?? []) as { user_id: string; display_name: string | null }[]).map((row) => [row.user_id, row.display_name?.trim() || "Student"]));
  const reportModels: CommunityModerationReport[] = reports.flatMap((report) => {
    const message = messageById.get(report.message_id);
    if (!message) return [];
    return [{ id: report.id, reason: report.reason as CommunityModerationReport["reason"], details: report.details, createdAt: report.created_at, channelTitle: channelById.get(report.channel_id) ?? "Community", message: moderationMessage(message, channelById.get(report.channel_id) ?? "Community", message.attached_resource_id ? resourceById.get(message.attached_resource_id) ?? null : null) }];
  });
  const actions: CommunityModerationAction[] = ((actionsResult.data ?? []) as ActionRow[]).map((row) => ({ id: row.id, actionType: row.action_type, actorRole: row.actor_role as CommunityModerationAction["actorRole"], reason: row.reason, createdAt: row.created_at, channelTitle: row.channel_id ? channelById.get(row.channel_id) ?? null : null, messageId: row.message_id, targetUserId: row.target_user_id }));
  const blocks: CommunityBlock[] = ((blocksResult.data ?? []) as BlockRow[]).map((row) => ({ id: row.id, userId: row.user_id, userLabel: profileById.get(row.user_id) ?? "Student", channelId: row.channel_id, channelTitle: row.channel_id ? channelById.get(row.channel_id) ?? null : null, reason: row.reason, startsAt: row.starts_at, endsAt: row.ends_at }));
  return { mode: "ready", role, reports: reportModels, actions, blocks };
}
