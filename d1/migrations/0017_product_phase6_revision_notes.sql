-- CA Progress revised product plan — Product Phase 6
-- CA revision notes, rich-document snapshots, private file links and Community attribution.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS note_revision_metadata (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  level_id TEXT REFERENCES course_levels(id) ON DELETE SET NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  document_json TEXT NOT NULL DEFAULT '{"version":1,"format":"html","html":""}',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','community')),
  source_message_id TEXT,
  source_channel_id TEXT,
  source_author_label TEXT,
  source_question TEXT,
  source_answer TEXT,
  source_created_at TEXT,
  source_discussion_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(note_id,user_id),
  CHECK(json_valid(document_json)),
  CHECK(
    source_type='manual' OR (
      source_message_id IS NOT NULL AND source_channel_id IS NOT NULL AND
      source_author_label IS NOT NULL AND source_answer IS NOT NULL AND
      source_created_at IS NOT NULL AND source_discussion_path IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_note_revision_owner_chapter
  ON note_revision_metadata(user_id,chapter_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_revision_owner_topic
  ON note_revision_metadata(user_id,topic_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_revision_source_message
  ON note_revision_metadata(user_id,source_message_id);

CREATE TABLE IF NOT EXISTS note_resource_links (
  note_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  embed_kind TEXT NOT NULL DEFAULT 'file' CHECK(embed_kind IN ('image','pdf','file')),
  position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(note_id,resource_id),
  FOREIGN KEY(note_id,user_id) REFERENCES notes(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(resource_id,user_id) REFERENCES uploaded_resources(id,owner_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_resource_links_owner_note
  ON note_resource_links(user_id,note_id,position);

-- Companion foreign keys need owner-paired uniqueness without altering legacy IDs or rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phase6_notes_id_owner ON notes(id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_phase6_uploads_id_owner ON uploaded_resources(id,owner_user_id);

-- Preserve every existing note exactly as stored. Phase 6 adds metadata beside it rather than
-- rewriting body_html/body_text, visibility, tags, IDs or moderation history.
INSERT OR IGNORE INTO note_revision_metadata(
  note_id,user_id,level_id,subject_id,chapter_id,topic_id,document_json,source_type,created_at,updated_at
)
SELECT
  n.id,
  n.user_id,
  s.level_id,
  n.subject_id,
  n.chapter_id,
  NULL,
  json_object('version',1,'format','html','html',n.body_html),
  'manual',
  n.created_at,
  n.updated_at
FROM notes n
LEFT JOIN subjects s ON s.id=n.subject_id;

-- A Community-derived note must start private. It can only become shared through the existing
-- explicit owner-controlled sharing/moderation flow after creation.
CREATE TRIGGER IF NOT EXISTS trg_phase6_community_note_private_insert
BEFORE INSERT ON note_revision_metadata
WHEN NEW.source_type='community'
 AND EXISTS (SELECT 1 FROM notes n WHERE n.id=NEW.note_id AND n.visibility<>'private')
BEGIN
  SELECT RAISE(ABORT,'Community-saved notes must be private when created.');
END;

CREATE TRIGGER IF NOT EXISTS trg_phase6_topic_matches_chapter_insert
BEFORE INSERT ON note_revision_metadata
WHEN NEW.topic_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM topics t WHERE t.id=NEW.topic_id AND t.chapter_id=NEW.chapter_id)
BEGIN
  SELECT RAISE(ABORT,'Selected Unit/AS must belong to the selected chapter.');
END;

CREATE TRIGGER IF NOT EXISTS trg_phase6_topic_matches_chapter_update
BEFORE UPDATE OF topic_id,chapter_id ON note_revision_metadata
WHEN NEW.topic_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM topics t WHERE t.id=NEW.topic_id AND t.chapter_id=NEW.chapter_id)
BEGIN
  SELECT RAISE(ABORT,'Selected Unit/AS must belong to the selected chapter.');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0017','product phase 6 revision notes tables and community attribution','99c55fa9f170ef0f0950d1406e8d73cad1800929');
