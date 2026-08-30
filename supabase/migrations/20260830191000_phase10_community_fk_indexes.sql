-- CA Progress V2 Phase 10 performance hardening.
-- Cover Community foreign-key lookup paths flagged by the Supabase database advisor.

create index if not exists community_channels_level_idx on public.community_channels (level_id) where level_id is not null;
create index if not exists community_channels_subject_idx on public.community_channels (subject_id) where subject_id is not null;

create index if not exists community_messages_reply_idx on public.community_messages (reply_to_message_id) where reply_to_message_id is not null;
create index if not exists community_messages_resource_idx on public.community_messages (attached_resource_id) where attached_resource_id is not null;

create index if not exists message_reactions_user_idx on public.message_reactions (user_id);
create index if not exists community_mentions_user_idx on public.community_message_mentions (user_id);

create index if not exists community_notifications_channel_idx on public.community_notifications (channel_id);
create index if not exists community_notifications_message_idx on public.community_notifications (message_id);

create index if not exists message_reports_channel_idx on public.message_reports (channel_id);
create index if not exists message_reports_reporter_idx on public.message_reports (reporter_user_id);
create index if not exists message_reports_reviewer_idx on public.message_reports (reviewed_by) where reviewed_by is not null;

create index if not exists chat_blocks_channel_idx on public.chat_blocks (channel_id) where channel_id is not null;
create index if not exists chat_blocks_blocked_by_idx on public.chat_blocks (blocked_by);

create index if not exists pinned_messages_message_idx on public.pinned_messages (message_id);
create index if not exists pinned_messages_pinned_by_idx on public.pinned_messages (pinned_by);

create index if not exists moderation_actions_actor_idx on public.moderation_actions (actor_user_id);
create index if not exists moderation_actions_channel_idx on public.moderation_actions (channel_id) where channel_id is not null;
create index if not exists moderation_actions_message_idx on public.moderation_actions (message_id) where message_id is not null;
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_user_id) where target_user_id is not null;
create index if not exists moderation_actions_report_idx on public.moderation_actions (report_id) where report_id is not null;
