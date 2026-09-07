const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 500;

export const FULL_BACKUP_BATCH_SIZE = DEFAULT_BATCH_SIZE;
export const FULL_BACKUP_MAX_BATCH_SIZE = MAX_BATCH_SIZE;

function dataset(key, table, ownerColumn, columns) {
  return Object.freeze({ key, table, ownerColumn, columns: Object.freeze(columns) });
}

export const FULL_BACKUP_DATASETS = Object.freeze([
  dataset("profile", "profiles", "user_id", ["user_id","display_name","ca_level","group_choice","attempt_key","timezone","daily_target_minutes","onboarding_step","onboarding_completed_at","primary_use","feature_guide_completed_at","primary_use_priority","created_at","updated_at"]),
  dataset("preferences", "user_preferences", "user_id", ["user_id","theme","accent","density","reduce_motion","created_at","updated_at"]),
  dataset("chapter-progress", "chapter_progress", "user_id", ["user_id","chapter_id","completed_at","revision_1_at","revision_2_at","test_1_at","test_2_at","created_at","updated_at"]),
  dataset("progress-events", "progress_events", "user_id", ["id","user_id","chapter_id","action","stage","previous_state","new_state","reverts_event_id","undone_at","created_at"]),
  dataset("planner-events", "planner_events", "user_id", ["id","user_id","event_type","entity_type","entity_id","payload","created_at"]),
  dataset("daily-plans", "daily_plans", "user_id", ["id","user_id","attempt_key","plan_date","timezone","target_minutes","generated_at","generation_reason","generation_version","source_event_id","created_at","updated_at"]),
  dataset("daily-plan-items", "daily_plan_items", "user_id", ["id","plan_id","user_id","scheduled_for","scheduled_at","position","item_kind","source_type","source_id","source_key","subject_id","chapter_id","revision_number","test_number","title","manual_note","estimated_minutes","priority_score","reason_code","reason_text","status","manual_override","completed_at","created_at","updated_at"]),
  dataset("revision-rules", "revision_rules", "user_id", ["user_id","interval_days","preferred_weekdays","revision_minutes","new_chapter_minutes","test_minutes","created_at","updated_at"]),
  dataset("revision-due-items", "revision_due_items", "user_id", ["id","user_id","chapter_id","revision_number","source_completed_at","due_at","manual_due_at","status","completed_at","created_at","updated_at"]),
  dataset("tasks", "tasks", "user_id", ["id","user_id","subject_id","chapter_id","title","notes","task_kind","due_at","estimated_minutes","status","sort_order","completed_at","created_at","updated_at"]),
  dataset("goals", "goals", "user_id", ["id","user_id","title","description","due_date","status","completed_at","created_at","updated_at"]),
  dataset("calendar-events", "user_calendar_events", "user_id", ["id","user_id","title","notes","starts_at","ends_at","all_day","created_at","updated_at"]),
  dataset("dashboard-events", "dashboard_events", "user_id", ["id","user_id","event_type","action_key","context","occurred_at","created_at"]),
  dataset("forecast-snapshots", "forecast_snapshots", "user_id", ["id","user_id","attempt_key","total_chapters","completed_chapters","remaining_chapters","observed_chapters_per_week","required_chapters_per_week","target_completion_date","projected_completion_date","attempt_anchor_date","date_source","status","explanation","source_event_id","created_at"]),
  dataset("study-sessions", "study_sessions", "user_id", ["id","user_id","subject_id","chapter_id","mode","timezone","started_at","ended_at","duration_seconds","focus_target_seconds","break_target_seconds","created_at"]),
  dataset("study-timer-state", "study_timer_state", "user_id", ["user_id","subject_id","chapter_id","mode","timezone","status","started_at","running_since","paused_at","elapsed_seconds","focus_target_seconds","break_target_seconds","last_interaction_at","created_at","updated_at"]),
  dataset("notes", "notes", "user_id", ["id","user_id","owner_label","title","body_html","body_text","subject_id","chapter_id","visibility","moderation_status","published_at","created_at","updated_at"]),
  dataset("note-tags", "note_tags", "user_id", ["id","user_id","name","normalized_name","created_at"]),
  dataset("note-tag-map", "note_tag_map", "user_id", ["note_id","tag_id","user_id","created_at"]),
  dataset("study-timer-phase3", "study_timer_phase3", "user_id", ["user_id","task_id","plan_item_id","pause_count","paused_seconds","created_at","updated_at"]),
  dataset("study-session-reflections", "study_session_phase3", "user_id", ["session_id","user_id","task_id","plan_item_id","pause_count","paused_seconds","completion_state","understanding_score","focus_rating","reflection_saved_at","created_at","updated_at"]),
  dataset("study-session-doubts", "study_session_doubts", "user_id", ["id","session_id","user_id","subject_id","chapter_id","visibility","body","status","community_channel_id","community_message_id","answered_at","resolved_at","created_at","updated_at"]),
  dataset("test-stage-records", "test_stage_records", "user_id", ["id","user_id","chapter_id","test_stage","marks_scored","marks_total","completed_at","progress_event_id","created_at","updated_at"]),
  dataset("test-attempts", "test_attempts", "user_id", ["id","user_id","subject_id","chapter_id","test_stage","attempt_number","marks_scored","marks_total","percentage","duration_minutes","completed_at","progress_event_id","created_at"]),
  dataset("test-mistakes", "test_attempt_mistakes", "user_id", ["id","attempt_id","user_id","category","note","created_at"]),
  dataset("note-revision-metadata", "note_revision_metadata", "user_id", ["note_id","user_id","level_id","subject_id","chapter_id","topic_id","document_json","source_type","source_message_id","source_channel_id","source_author_label","source_question","source_answer","source_created_at","source_discussion_path","created_at","updated_at"]),
  dataset("note-resource-links", "note_resource_links", "user_id", ["note_id","resource_id","user_id","embed_kind","position","created_at"]),
  dataset("community-saved-messages", "community_saved_messages", "user_id", ["user_id","message_id","created_at"]),
  dataset("planner-task-settings", "planner_task_phase8", "user_id", ["task_id","user_id","schedule_mode","target_date","created_at","updated_at"]),
  dataset("planner-goal-settings", "planner_goal_phase8", "user_id", ["goal_id","user_id","goal_kind","target_value","target_unit","starts_on","created_at","updated_at"]),
  dataset("notification-preferences", "notification_preferences", "user_id", ["user_id","revision_due","test_tomorrow","goal_near_completion","doubt_answered","buddy_activity","frequency","max_per_day","created_at","updated_at"]),
  dataset("notifications", "in_app_notifications", "user_id", ["id","user_id","notification_type","title","body","action_href","entity_type","entity_id","read_at","created_at"]),
  dataset("study-profile", "study_profiles", "user_id", ["user_id","public_bio","profile_visibility","progress_visibility","streak_visibility","show_level","show_attempt","created_at","updated_at"]),
  dataset("study-buddy-sharing", "study_buddy_sharing", "owner_user_id", ["relationship_id","owner_user_id","share_profile","share_progress","share_streak","share_goals","share_study_status","updated_at"]),
  dataset("study-buddy-contributions", "study_buddy_goal_contributions", "user_id", ["goal_id","user_id","study_session_id","minutes","created_at"]),
  dataset("study-together-participation", "study_together_participants", "user_id", ["study_together_id","user_id","joined_at","canonical_study_session_id","completed_at"]),
  dataset("xp-ledger", "xp_ledger", "user_id", ["id","user_id","event_key","event_type","source_type","source_id","xp_amount","occurred_at","metadata","created_at"]),
  dataset("streak-days", "study_streak_days", "user_id", ["user_id","local_date","source_timezone","qualification_type","source_id","qualified_at","created_at"]),
  dataset("achievements", "user_achievements", "user_id", ["user_id","achievement_key","unlocked_at","evidence_snapshot","created_at"]),
  dataset("leaderboard-profile", "leaderboard_profiles", "user_id", ["user_id","opted_in","public_alias","opted_in_at","created_at","updated_at"]),
  dataset("gamification-bonus", "gamification_bonus_ledger", "user_id", ["id","user_id","event_key","event_type","source_id","xp_amount","occurred_at","metadata","created_at"]),
  dataset("referral-code", "referral_codes", "user_id", ["user_id","code","created_at"]),
  dataset("leaderboard-rewards", "leaderboard_reward_grants", "user_id", ["id","competition_period","reward_period","user_id","rank","reward_tier","status","starts_at","ends_at","activated_at","created_at","updated_at"]),
]);

export const FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES = Object.freeze([
  "resource_upload_reservations",
  "test_attachment_upload_intents",
  "admin_audit_logs",
  "community_verification_audit",
  "study_buddy_reports",
  "anti_cheat_flags",
  "leaderboard_operation_log",
  "phase4_migration_runs",
  "phase4_migration_checkpoints",
  "phase4_migration_failures",
  "phase4_storage_objects",
  "phase4_shadow_comparisons",
]);

export const OWNED_RESOURCE_FILES_FIRST_PAGE_SQL = `SELECT rowid AS __backup_rowid,id,original_filename,safe_filename,mime_type,size_bytes,storage_path,created_at
FROM uploaded_resources
WHERE owner_user_id=?1
ORDER BY rowid ASC
LIMIT ?2`;
export const OWNED_RESOURCE_FILES_NEXT_PAGE_SQL = `SELECT rowid AS __backup_rowid,id,original_filename,safe_filename,mime_type,size_bytes,storage_path,created_at
FROM uploaded_resources
WHERE owner_user_id=?1 AND rowid>?2
ORDER BY rowid ASC
LIMIT ?3`;

export const OWNED_TEST_FILES_FIRST_PAGE_SQL = `SELECT rowid AS __backup_rowid,id,attempt_id,attachment_kind,filename,mime_type,size_bytes,object_key,created_at
FROM test_attempt_attachments
WHERE user_id=?1
ORDER BY rowid ASC
LIMIT ?2`;
export const OWNED_TEST_FILES_NEXT_PAGE_SQL = `SELECT rowid AS __backup_rowid,id,attempt_id,attachment_kind,filename,mime_type,size_bytes,object_key,created_at
FROM test_attempt_attachments
WHERE user_id=?1 AND rowid>?2
ORDER BY rowid ASC
LIMIT ?3`;

function assertUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("Authenticated user id is required for exports.");
}

function normalizeBatchSize(value) {
  const size = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, size));
}

function assertDataset(input) {
  const match = FULL_BACKUP_DATASETS.find((entry) => entry.key === input?.key && entry.table === input?.table);
  if (!match || match !== input) throw new Error("Unknown full-backup dataset.");
}

export function buildOwnedBackupPageSql(input) {
  assertDataset(input.dataset);
  const columns = input.dataset.columns.join(",");
  const cursorClause = input.cursor ? " AND rowid>?2" : "";
  const limitParameter = input.cursor ? "?3" : "?2";
  return `SELECT rowid AS __backup_rowid,${columns}\nFROM ${input.dataset.table}\nWHERE ${input.dataset.ownerColumn}=?1${cursorClause}\nORDER BY rowid ASC\nLIMIT ${limitParameter}`;
}

export async function fetchOwnedBackupDatasetPage(db, userId, datasetConfig, options = {}) {
  assertUserId(userId);
  assertDataset(datasetConfig);
  const batchSize = normalizeBatchSize(options.batchSize);
  const cursor = Number.isInteger(options.cursor) && options.cursor > 0 ? options.cursor : null;
  const sql = buildOwnedBackupPageSql({ dataset: datasetConfig, cursor });
  const result = cursor
    ? await db.prepare(sql).bind(userId, cursor, batchSize).all()
    : await db.prepare(sql).bind(userId, batchSize).all();
  const rawRows = result.results ?? [];
  const last = rawRows.at(-1);
  const rows = rawRows.map((row) => {
    const { __backup_rowid: _cursor, ...safe } = row;
    return safe;
  });
  return {
    rows,
    nextCursor: rawRows.length === batchSize && last ? Number(last.__backup_rowid) : null,
  };
}

export async function* iterateOwnedBackupDatasetPages(db, userId, datasetConfig, options = {}) {
  assertUserId(userId);
  let cursor = null;
  for (;;) {
    const page = await fetchOwnedBackupDatasetPage(db, userId, datasetConfig, { ...options, cursor });
    yield page.rows;
    if (!page.nextCursor) return;
    if (cursor !== null && page.nextCursor <= cursor) throw new Error("Full backup dataset cursor did not advance.");
    cursor = page.nextCursor;
  }
}

async function* iterateOwnedInternalFileRows(db, userId, sqlPair, options = {}) {
  assertUserId(userId);
  const batchSize = normalizeBatchSize(options.batchSize);
  let cursor = null;
  for (;;) {
    const sql = cursor ? sqlPair.next : sqlPair.first;
    const result = cursor
      ? await db.prepare(sql).bind(userId, cursor, batchSize).all()
      : await db.prepare(sql).bind(userId, batchSize).all();
    const rows = result.results ?? [];
    for (const row of rows) yield row;
    const last = rows.at(-1);
    if (rows.length !== batchSize || !last) return;
    const nextCursor = Number(last.__backup_rowid);
    if (cursor !== null && nextCursor <= cursor) throw new Error("Full backup file cursor did not advance.");
    cursor = nextCursor;
  }
}

export function iterateOwnedResourceFileRows(db, userId, options = {}) {
  return iterateOwnedInternalFileRows(db, userId, { first: OWNED_RESOURCE_FILES_FIRST_PAGE_SQL, next: OWNED_RESOURCE_FILES_NEXT_PAGE_SQL }, options);
}

export function iterateOwnedTestFileRows(db, userId, options = {}) {
  return iterateOwnedInternalFileRows(db, userId, { first: OWNED_TEST_FILES_FIRST_PAGE_SQL, next: OWNED_TEST_FILES_NEXT_PAGE_SQL }, options);
}
