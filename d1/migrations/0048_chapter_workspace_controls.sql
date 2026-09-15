-- A1.4 — user-owned Chapter Hub controls and curated material.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chapter_workspace_preferences (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  understanding_level INTEGER CHECK(understanding_level BETWEEN 0 AND 100),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,chapter_id)
);

CREATE TABLE IF NOT EXISTS chapter_workspace_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  link_kind TEXT NOT NULL CHECK(link_kind IN ('useful','youtube','revision')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  url TEXT NOT NULL CHECK(length(url) BETWEEN 8 AND 2048),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapter_workspace_links_owner
  ON chapter_workspace_links(user_id,chapter_id,created_at DESC);

CREATE TABLE IF NOT EXISTS chapter_workspace_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('personal_note','personal_file','icai_resource','community_note','community_resource')),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,chapter_id,source_kind,source_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_workspace_items_owner
  ON chapter_workspace_items(user_id,chapter_id,created_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0048','A1.4 user-owned chapter workspace controls and curated material','a1-4-chapter-workspace');
