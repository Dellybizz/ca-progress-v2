INSERT OR IGNORE INTO subscription_lifecycle_policies(id,version,state,access_grace_days,storage_grace_days,important_storage_percent,price_lock_months) VALUES('owner-2026-10-13-storage',2,'published',3,7,10,12);
CREATE TABLE storage_file_activity (
 file_kind TEXT NOT NULL CHECK(file_kind IN ('resource','test_attachment')),file_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 last_opened_at TEXT NOT NULL,PRIMARY KEY(file_kind,file_id)
);
CREATE TABLE test_attachment_importance (
 attachment_id TEXT PRIMARY KEY REFERENCES test_attempt_attachments(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 marked_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE storage_quota_state (
 user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,plan_id TEXT NOT NULL,limit_bytes INTEGER NOT NULL CHECK(limit_bytes>=0),policy_version_id TEXT,
 last_checked_at TEXT NOT NULL,lease_token TEXT,lease_until TEXT
);
ALTER TABLE subscription_storage_transitions ADD COLUMN last_error TEXT;
CREATE UNIQUE INDEX storage_one_active_cleanup ON subscription_storage_transitions(user_id) WHERE state IN ('grace','processing','review');
CREATE TABLE storage_cleanup_email_outbox (
 id TEXT PRIMARY KEY,transition_id TEXT NOT NULL REFERENCES subscription_storage_transitions(id),user_id TEXT NOT NULL REFERENCES app_users(user_id),
 warning_kind TEXT NOT NULL CHECK(warning_kind IN ('scheduled','three_days','one_day')),due_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','suppressed','review')),
 request_key TEXT NOT NULL UNIQUE,payload_json TEXT,first_dispatched_at TEXT,provider_email_id TEXT,sent_at TEXT,last_error TEXT,
 lease_token TEXT,lease_until TEXT,last_attempt_at TEXT,UNIQUE(transition_id,warning_kind)
);
CREATE INDEX storage_email_due ON storage_cleanup_email_outbox(state,due_at);
CREATE TABLE storage_cleanup_deletions (
 id TEXT PRIMARY KEY,transition_id TEXT NOT NULL REFERENCES subscription_storage_transitions(id),user_id TEXT NOT NULL REFERENCES app_users(user_id),
 file_kind TEXT NOT NULL CHECK(file_kind IN ('resource','test_attachment')),file_id TEXT NOT NULL,object_key TEXT NOT NULL,size_bytes INTEGER NOT NULL CHECK(size_bytes>=0),
 important_at_claim INTEGER NOT NULL CHECK(important_at_claim IN (0,1)),
 state TEXT NOT NULL CHECK(state IN ('deleting','deleted','cancelled','review')),claimed_at TEXT NOT NULL,deleted_at TEXT,last_error TEXT,
 UNIQUE(file_kind,file_id)
);
CREATE INDEX storage_deletions_owner ON storage_cleanup_deletions(user_id,state);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0090','Seven day storage warnings ordered permanent cleanup and durable email receipts','payment-rules-phase4');
