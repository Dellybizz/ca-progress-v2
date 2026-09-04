-- Phase 5 hot-query index completion.
-- Only indexes absent from 0007/0008 are added here. Every statement is
-- idempotent so a failed apply can safely be resumed.

-- Viewer reaction lookup and per-message reaction aggregation.
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_user_emoji
ON message_reactions(message_id,user_id,emoji);

-- Latest pin lookup for a channel.
CREATE INDEX IF NOT EXISTS idx_pinned_messages_channel_pinned_message
ON pinned_messages(channel_id,pinned_at,message_id);

-- Public/shared resource feed filtering and newest-first ordering.
CREATE INDEX IF NOT EXISTS idx_uploaded_resources_visibility_moderation_published
ON uploaded_resources(visibility,moderation_status,published_at);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0009','phase 5 hot-query index completion','phase-12-operations-admin-platform');
