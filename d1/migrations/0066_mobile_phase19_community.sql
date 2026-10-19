ALTER TABLE community_messages ADD COLUMN client_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_messages_client_id ON community_messages(user_id,client_message_id) WHERE client_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_sequence_events (
  channel_id TEXT NOT NULL,
  sequence_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('message.created','message.updated','message.deleted','reaction.changed','pin.changed','read.changed')),
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(channel_id,sequence_id),
  FOREIGN KEY(channel_id) REFERENCES community_channels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_community_sequence_events_delta ON community_sequence_events(channel_id,sequence_id);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0066','mobile phase 19 community sequence journal','e26fb075');
