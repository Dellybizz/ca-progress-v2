-- Phase 5 hot-path indexes for Cloudflare authentication and activity reads.
-- Idempotent and safe to resume.

CREATE INDEX IF NOT EXISTS idx_sessions_token_active
ON sessions(token_hash, revoked_at, expires_at, absolute_expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_last_seen
ON sessions(last_seen_at);

CREATE INDEX IF NOT EXISTS idx_auth_identities_provider_subject
ON auth_identities(provider, provider_user_id);

CREATE INDEX IF NOT EXISTS idx_auth_identities_supabase_email
ON auth_identities(provider, email);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status_dates
ON user_subscriptions(user_id, status, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_plan_entitlements_plan_enabled_feature
ON plan_entitlements(plan_id, enabled, feature_key);

CREATE INDEX IF NOT EXISTS idx_progress_events_user_created
ON progress_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_community_messages_channel_status_sequence
ON community_messages(channel_id,moderation_status,sequence_id);

CREATE INDEX IF NOT EXISTS idx_channel_read_state_channel_user_sequence
ON channel_read_state(channel_id,user_id,last_read_sequence);

CREATE INDEX IF NOT EXISTS idx_chat_blocks_user_end_channel
ON chat_blocks(user_id,ends_at,channel_id);

CREATE INDEX IF NOT EXISTS idx_community_channels_active_scope_sort
ON community_channels(is_active,scope_type,sort_order,title);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0008','phase 5 Cloudflare auth and hot-path indexes','phase-12-operations-admin-platform');
