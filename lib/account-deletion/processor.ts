import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import { getResourceR2Bucket } from "@/lib/resources/r2";
import { enqueueBackgroundJob } from "@/lib/jobs/queue";

type DeletionRequest = { id: string; user_id: string; status: string; scheduled_for: string };

const USER_DELETE_STATEMENTS = [
  "DELETE FROM web_push_subscriptions WHERE user_id=?1",
  "DELETE FROM sessions WHERE application_user_id=?1",
  "DELETE FROM auth_identities WHERE application_user_id=?1",
  "DELETE FROM guest_account_migrations WHERE account_user_id=?1",
  "DELETE FROM notification_outbox WHERE user_id=?1",
  "DELETE FROM in_app_notifications WHERE user_id=?1",
  "DELETE FROM notification_preferences WHERE user_id=?1",
  "DELETE FROM community_saved_messages WHERE user_id=?1",
  "DELETE FROM community_follows WHERE user_id=?1 OR followed_user_id=?1",
  "DELETE FROM community_messages WHERE user_id=?1",
  "DELETE FROM study_buddy_reports WHERE reporter_user_id=?1 OR target_user_id=?1",
  "DELETE FROM study_buddy_safety WHERE owner_user_id=?1 OR target_user_id=?1",
  "DELETE FROM study_buddy_relationships WHERE member_a_user_id=?1 OR member_b_user_id=?1",
  "DELETE FROM study_profile_buddies WHERE owner_user_id=?1 OR buddy_user_id=?1",
  "DELETE FROM test_attachment_upload_intents WHERE user_id=?1",
  "DELETE FROM test_attempt_attachments WHERE user_id=?1",
  "DELETE FROM test_attempt_mistakes WHERE user_id=?1",
  "DELETE FROM test_attempts WHERE user_id=?1",
  "DELETE FROM test_stage_records WHERE user_id=?1",
  "DELETE FROM note_resource_links WHERE user_id=?1",
  "DELETE FROM note_revision_metadata WHERE user_id=?1",
  "DELETE FROM note_tag_map WHERE user_id=?1",
  "DELETE FROM note_tags WHERE user_id=?1",
  "DELETE FROM notes WHERE user_id=?1",
  "DELETE FROM uploaded_resources WHERE owner_user_id=?1",
  "DELETE FROM r2_upload_intents WHERE user_id=?1",
  "DELETE FROM planner_task_phase8 WHERE user_id=?1",
  "DELETE FROM planner_goal_phase8 WHERE user_id=?1",
  "DELETE FROM daily_plan_items WHERE user_id=?1",
  "DELETE FROM daily_plans WHERE user_id=?1",
  "DELETE FROM planner_events WHERE user_id=?1",
  "DELETE FROM revision_due_items WHERE user_id=?1",
  "DELETE FROM revision_rules WHERE user_id=?1",
  "DELETE FROM tasks WHERE user_id=?1",
  "DELETE FROM goals WHERE user_id=?1",
  "DELETE FROM user_calendar_events WHERE user_id=?1",
  "DELETE FROM study_session_doubts WHERE user_id=?1",
  "DELETE FROM study_session_phase3 WHERE user_id=?1",
  "DELETE FROM study_timer_phase3 WHERE user_id=?1",
  "DELETE FROM study_sessions WHERE user_id=?1",
  "DELETE FROM study_timer_state WHERE user_id=?1",
  "DELETE FROM dashboard_events WHERE user_id=?1",
  "DELETE FROM forecast_snapshots WHERE user_id=?1",
  "DELETE FROM progress_events WHERE user_id=?1",
  "DELETE FROM chapter_progress WHERE user_id=?1",
  "DELETE FROM chapter_workspace_items WHERE user_id=?1",
  "DELETE FROM chapter_workspace_links WHERE user_id=?1",
  "DELETE FROM chapter_workspace_preferences WHERE user_id=?1",
  "DELETE FROM xp_ledger WHERE user_id=?1",
  "DELETE FROM study_streak_days WHERE user_id=?1",
  "DELETE FROM user_achievements WHERE user_id=?1",
  "DELETE FROM leaderboard_profiles WHERE user_id=?1",
  "DELETE FROM gamification_bonus_ledger WHERE user_id=?1",
  "DELETE FROM referrals WHERE referrer_user_id=?1 OR referred_user_id=?1",
  "DELETE FROM referral_codes WHERE user_id=?1",
  "DELETE FROM study_profiles WHERE user_id=?1",
  "DELETE FROM onboarding_experience WHERE user_id=?1",
  "DELETE FROM user_preferences WHERE user_id=?1",
  "DELETE FROM profiles WHERE user_id=?1",
] as const;

async function subjectHash(requestId: string, userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${requestId}:${userId}`));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function ownedObjectKeys(database: HotD1Database, userId: string) {
  const result = await database.prepare("SELECT storage_path AS object_key FROM uploaded_resources WHERE owner_user_id=?1 UNION SELECT object_key FROM test_attempt_attachments WHERE user_id=?1 UNION SELECT object_key FROM test_attachment_upload_intents WHERE user_id=?1 UNION SELECT object_key FROM r2_upload_intents WHERE user_id=?1").bind(userId).all<{ object_key: string }>();
  return [...new Set((result.results ?? []).map((row) => row.object_key).filter(Boolean))];
}

export async function enqueueDueAccountDeletions(limit = 25) {
  const database = getHotD1Database();
  const due = await database.prepare("SELECT id,user_id,status,scheduled_for FROM account_deletion_requests WHERE (status='scheduled' AND scheduled_for<=CURRENT_TIMESTAMP) OR (status='processing' AND processing_started_at<datetime('now','-2 hours')) ORDER BY scheduled_for LIMIT ?1").bind(Math.max(1, Math.min(100, limit))).all<DeletionRequest>();
  for (const request of due.results ?? []) {
    await enqueueBackgroundJob({
      type: "account-deletion-process",
      idempotencyKey: `account-deletion-process:${request.id}`,
      payload: { requestId: request.id },
      createdBy: null,
    });
  }
  return { queued: due.results?.length ?? 0 };
}

export async function processAccountDeletion(requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid account deletion request ID.");
  const database = getHotD1Database();
  const request = await database.prepare("SELECT id,user_id,status,scheduled_for FROM account_deletion_requests WHERE id=?1 LIMIT 1").bind(requestId).first<DeletionRequest>();
  if (!request) throw new Error("Account deletion request does not exist.");
  if (request.status === "completed") return { requestId, status: "completed", replay: true };
  if (request.status === "cancelled") return { requestId, status: "cancelled" };
  if (!['scheduled','processing'].includes(request.status) || Date.parse(request.scheduled_for) > Date.now()) throw new Error("Account deletion request is not due.");

  const claim = await database.prepare("UPDATE account_deletion_requests SET status='processing',processing_started_at=COALESCE(processing_started_at,CURRENT_TIMESTAMP),failure_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status IN ('scheduled','processing')").bind(requestId).run();
  if (!claim) throw new Error("Account deletion request could not be claimed.");

  const objectKeys = await ownedObjectKeys(database, request.user_id);
  const bucket = getResourceR2Bucket();
  for (const key of objectKeys) await bucket.delete(key);

  const hash = await subjectHash(request.id, request.user_id);
  const statements = [database.prepare("UPDATE app_users SET auth_provider='deleted',provider_subject=NULL,account_state='deleted',role='student',updated_at=CURRENT_TIMESTAMP WHERE user_id=?1").bind(request.user_id)];
  statements.push(...USER_DELETE_STATEMENTS.map((sql) => database.prepare(sql).bind(request.user_id)));
  statements.push(database.prepare("INSERT INTO account_deletion_receipts(request_id,subject_hash,deleted_object_count) VALUES(?1,?2,?3) ON CONFLICT(request_id) DO NOTHING").bind(request.id, hash, objectKeys.length));
  statements.push(database.prepare("UPDATE account_deletion_requests SET status='completed',completed_at=CURRENT_TIMESTAMP,failure_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='processing'").bind(request.id));
  await database.batch(statements);
  return { requestId, status: "completed", deletedObjectCount: objectKeys.length };
}
