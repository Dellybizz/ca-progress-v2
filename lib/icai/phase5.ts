import "server-only";

import { getD1RuntimeDatabase, type D1DatabaseLike } from "@/lib/data/d1/client";
import { decideIcaiReview } from "@/lib/icai/review";

export const ICAI_PHASE5_PROBE_PREFIX = "__phase5__";

function cleanCorrelation(value: unknown) {
  const cleaned = String(value ?? "").trim().replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  if (!cleaned) throw new Error("Phase 5 correlation id is required.");
  return cleaned;
}

function stableNegativeId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return -1 * (((hash >>> 0) % 2_000_000_000) + 1);
}

async function reviewStatus(db: D1DatabaseLike, id: string) {
  return db.prepare("SELECT status FROM icai_review_queue WHERE id=?1").bind(id).first<{ status: string }>();
}

export async function runIcaiPhase5ReviewProbe(input: { correlationId: string }) {
  const correlationId = cleanCorrelation(input.correlationId);
  const reviewerUserId = `${ICAI_PHASE5_PROBE_PREFIX}verifier_${correlationId}`;
  const db = getD1RuntimeDatabase();
  const source = await db.prepare("SELECT id,official_url FROM icai_sources WHERE is_active=1 ORDER BY id LIMIT 1")
    .first<{ id: string; official_url: string }>();
  if (!source) throw new Error("Phase 5 requires at least one active ICAI source.");

  const now = new Date().toISOString();
  const runId = `${ICAI_PHASE5_PROBE_PREFIX}run_${correlationId}`;
  const snapshotId = `${ICAI_PHASE5_PROBE_PREFIX}snapshot_${correlationId}`;
  const approveResourceId = `${ICAI_PHASE5_PROBE_PREFIX}approve_resource_${correlationId}`;
  const rejectResourceId = `${ICAI_PHASE5_PROBE_PREFIX}reject_resource_${correlationId}`;
  const approveReviewId = `${ICAI_PHASE5_PROBE_PREFIX}approve_review_${correlationId}`;
  const rejectReviewId = `${ICAI_PHASE5_PROBE_PREFIX}reject_review_${correlationId}`;
  const approveChangeId = stableNegativeId(`${correlationId}:approve`);
  let rejectChangeId = stableNegativeId(`${correlationId}:reject`);
  if (rejectChangeId === approveChangeId) rejectChangeId -= 1;
  const metadata = JSON.stringify({ phase5_probe: true, correlation_id: correlationId });
  const oldValue = JSON.stringify({ status: "active", source_snapshot_id: snapshotId });
  const newValue = JSON.stringify({ status: "removed", source_snapshot_id: snapshotId });
  const patch = newValue;

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO app_users(user_id,auth_provider,provider_subject,account_state,created_at,updated_at) VALUES(?1,'phase5-verifier',?2,'active',?3,?3)")
      .bind(reviewerUserId, correlationId, now),
    db.prepare("INSERT OR IGNORE INTO icai_sync_runs(id,trigger_type,requested_by,parser_version,status,started_at,completed_at,source_total,source_processed,source_succeeded,details) VALUES(?1,'test',NULL,'phase5-live-probe','success',?2,?2,1,1,1,?3)")
      .bind(runId, now, metadata),
    db.prepare("INSERT OR IGNORE INTO icai_source_snapshots(id,run_id,source_id,fetched_at,http_status,canonical_hash,is_changed,parser_version,parsed_item_count,metadata) VALUES(?1,?2,?3,?4,200,?5,1,'phase5-live-probe',2,?6)")
      .bind(snapshotId, runId, source.id, now, "5".repeat(64), metadata),
    db.prepare("INSERT OR IGNORE INTO icai_resources(id,source_id,source_snapshot_id,resource_type,title,summary,official_url,source_url,published_on,status,verification_status,parser_version,content_hash,first_seen_at,last_seen_at,last_changed_at,metadata,created_at,updated_at) VALUES(?1,?2,?3,'announcement',?4,'Isolated deployment verification fixture.',?5,?5,NULL,'active','phase5_probe','phase5-live-probe',?6,?7,?7,?7,?8,?7,?7)")
      .bind(approveResourceId, source.id, snapshotId, `Phase 5 approval probe ${correlationId}`, source.official_url, "a".repeat(64), now, metadata),
    db.prepare("INSERT OR IGNORE INTO icai_resources(id,source_id,source_snapshot_id,resource_type,title,summary,official_url,source_url,published_on,status,verification_status,parser_version,content_hash,first_seen_at,last_seen_at,last_changed_at,metadata,created_at,updated_at) VALUES(?1,?2,?3,'announcement',?4,'Isolated deployment verification fixture.',?5,?5,NULL,'active','phase5_probe','phase5-live-probe',?6,?7,?7,?7,?8,?7,?7)")
      .bind(rejectResourceId, source.id, snapshotId, `Phase 5 rejection probe ${correlationId}`, source.official_url, "b".repeat(64), now, metadata),
    db.prepare("INSERT OR IGNORE INTO icai_change_events(id,run_id,source_id,entity_type,entity_id,change_type,field_name,old_value,new_value,risk_level,decision_status,detected_at) VALUES(?1,?2,?3,'resource',?4,'removed','status',?5,?6,'high','pending_review',?7)")
      .bind(approveChangeId, runId, source.id, approveResourceId, oldValue, newValue, now),
    db.prepare("INSERT OR IGNORE INTO icai_change_events(id,run_id,source_id,entity_type,entity_id,change_type,field_name,old_value,new_value,risk_level,decision_status,detected_at) VALUES(?1,?2,?3,'resource',?4,'removed','status',?5,?6,'high','pending_review',?7)")
      .bind(rejectChangeId, runId, source.id, rejectResourceId, oldValue, newValue, now),
    db.prepare("INSERT OR IGNORE INTO icai_review_queue(id,change_event_id,run_id,source_id,entity_type,entity_id,title,reason,proposed_patch,confidence,status,created_at,updated_at) VALUES(?1,?2,?3,?4,'resource',?5,?6,'Phase 5 proves reviewed canonical application.',?7,1,'pending',?8,?8)")
      .bind(approveReviewId, approveChangeId, runId, source.id, approveResourceId, `Phase 5 approval ${correlationId}`, patch, now),
    db.prepare("INSERT OR IGNORE INTO icai_review_queue(id,change_event_id,run_id,source_id,entity_type,entity_id,title,reason,proposed_patch,confidence,status,created_at,updated_at) VALUES(?1,?2,?3,?4,'resource',?5,?6,'Phase 5 proves rejection leaves canonical data unchanged.',?7,1,'pending',?8,?8)")
      .bind(rejectReviewId, rejectChangeId, runId, source.id, rejectResourceId, `Phase 5 rejection ${correlationId}`, patch, now),
  ]);

  const approveStatus = await reviewStatus(db, approveReviewId);
  if (approveStatus?.status === "pending") {
    await decideIcaiReview({ id: approveReviewId, decision: "approve", reviewerUserId, notes: `Phase 5 live approval ${correlationId}` });
  } else if (approveStatus?.status !== "approved") {
    throw new Error(`Phase 5 approval review is unexpectedly ${approveStatus?.status ?? "missing"}.`);
  }

  const rejectStatus = await reviewStatus(db, rejectReviewId);
  if (rejectStatus?.status === "pending") {
    await decideIcaiReview({ id: rejectReviewId, decision: "reject", reviewerUserId, notes: `Phase 5 live rejection ${correlationId}` });
  } else if (rejectStatus?.status !== "rejected") {
    throw new Error(`Phase 5 rejection review is unexpectedly ${rejectStatus?.status ?? "missing"}.`);
  }

  const evidence = await db.prepare(`SELECT
      (SELECT status FROM icai_resources WHERE id=?1) AS approved_resource_status,
      (SELECT status FROM icai_resources WHERE id=?2) AS rejected_resource_status,
      (SELECT status FROM icai_review_queue WHERE id=?3) AS approval_review_status,
      (SELECT status FROM icai_review_queue WHERE id=?4) AS rejection_review_status,
      (SELECT COUNT(*) FROM icai_review_decisions WHERE review_id IN (?3,?4)) AS decision_count`)
    .bind(approveResourceId, rejectResourceId, approveReviewId, rejectReviewId)
    .first<{ approved_resource_status: string; rejected_resource_status: string; approval_review_status: string; rejection_review_status: string; decision_count: number }>();

  if (!evidence || evidence.approved_resource_status !== "removed" || evidence.rejected_resource_status !== "active" || evidence.approval_review_status !== "approved" || evidence.rejection_review_status !== "rejected" || Number(evidence.decision_count) !== 2) {
    throw new Error("Phase 5 review probe did not produce the required canonical and audit outcomes.");
  }

  await db.prepare("DELETE FROM app_users WHERE user_id=?1 AND auth_provider='phase5-verifier'").bind(reviewerUserId).run();
  return { correlationId, runId, approveReviewId, rejectReviewId, ...evidence };
}
