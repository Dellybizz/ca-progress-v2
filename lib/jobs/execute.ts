import "server-only";

import { getHotD1Database } from "@/lib/data/d1/runtime";
import { runIcaiSync } from "@/lib/icai/sync";
import type { BackgroundJob } from "./queue";

function db() { return getHotD1Database() as any; }
function json(value: unknown) { return JSON.stringify(value ?? {}); }

export async function executeBackgroundJob(job: BackgroundJob) {
  switch (job.type) {
    case "icai-sync":
      return runIcaiSync({
        trigger: job.payload.trigger === "manual" ? "manual" : "cron",
        requestedBy: typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : null,
      });
    case "analytics-aggregate": {
      const date = typeof job.payload.date === "string" ? job.payload.date : new Date().toISOString().slice(0, 10);
      const rows = await db().prepare("SELECT event_type, COUNT(*) AS event_count FROM dashboard_events WHERE occurred_at >= ?1 AND occurred_at < ?2 GROUP BY event_type")
        .bind(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`).all();
      for (const row of (rows.results ?? []) as Array<{event_type:string;event_count:number}>) {
        await db().prepare("INSERT INTO analytics_daily_rollups(rollup_date,event_type,event_count,updated_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP) ON CONFLICT(rollup_date,event_type) DO UPDATE SET event_count=excluded.event_count,updated_at=CURRENT_TIMESTAMP")
          .bind(date, row.event_type, Number(row.event_count)).run();
      }
      return { date, eventTypes: (rows.results ?? []).length };
    }
    case "notification-fanout": {
      const userId = typeof job.payload.userId === "string" ? job.payload.userId : null;
      const kind = typeof job.payload.kind === "string" ? job.payload.kind.slice(0, 80) : "system";
      if (!userId) throw new Error("Notification fan-out requires userId.");
      await db().prepare("INSERT OR IGNORE INTO notification_outbox(id,user_id,kind,payload_json,idempotency_key) VALUES(?1,?2,?3,?4,?5)")
        .bind(crypto.randomUUID(), userId, kind, json(job.payload), job.idempotencyKey).run();
      return { queued: true };
    }
    case "attachment-process": {
      const resourceId = typeof job.payload.resourceId === "string" ? job.payload.resourceId : null;
      const userId = typeof job.payload.userId === "string" ? job.payload.userId : null;
      if (!resourceId || !userId) throw new Error("Attachment processing requires resourceId and userId.");
      await db().prepare("INSERT INTO attachment_processing_jobs(id,resource_id,user_id,status,attempts,updated_at) VALUES(?1,?2,?3,'ready',1,CURRENT_TIMESTAMP) ON CONFLICT(resource_id) DO UPDATE SET status='ready',attempts=attachment_processing_jobs.attempts+1,last_error=NULL,updated_at=CURRENT_TIMESTAMP")
        .bind(crypto.randomUUID(), resourceId, userId).run();
      return { resourceId, status: "ready" };
    }
    case "cleanup": {
      const days = Math.max(1, Math.min(90, Number(job.payload.retentionDays ?? 30)));
      await db().prepare("DELETE FROM background_jobs WHERE status='succeeded' AND updated_at < datetime('now', ?1)").bind(`-${days} days`).run();
      await db().prepare("DELETE FROM notification_outbox WHERE status='sent' AND created_at < datetime('now', ?1)").bind(`-${days} days`).run();
      return { retentionDays: days };
    }
    case "ai-plan-generation": {
      const userId = typeof job.payload.userId === "string" ? job.payload.userId : null;
      const planDate = typeof job.payload.planDate === "string" ? job.payload.planDate : new Date().toISOString().slice(0, 10);
      if (!userId) throw new Error("AI plan generation requires userId.");
      const existing = await db().prepare("SELECT id,plan_date,generated_at FROM daily_plans WHERE user_id=?1 AND plan_date=?2 LIMIT 1").bind(userId, planDate).first() as {id:string;plan_date:string;generated_at:string}|null;
      if (!existing) throw new Error("No persisted planner input is available yet.");
      const items = await db().prepare("SELECT id,source_type,source_key,title,item_kind,estimated_minutes,priority_score,status,position FROM daily_plan_items WHERE plan_id=?1 ORDER BY position LIMIT 120").bind(existing.id).all();
      await db().prepare("INSERT INTO student_plan_snapshots(id,user_id,plan_date,status,plan_json,generated_at,source_job_id,updated_at) VALUES(?1,?2,?3,'ready',?4,?5,?6,CURRENT_TIMESTAMP) ON CONFLICT(user_id,plan_date) DO UPDATE SET status='ready',plan_json=excluded.plan_json,generated_at=excluded.generated_at,source_job_id=excluded.source_job_id,error=NULL,updated_at=CURRENT_TIMESTAMP")
        .bind(crypto.randomUUID(), userId, planDate, json({ plan: existing, items: items.results ?? [] }), existing.generated_at ?? new Date().toISOString(), job.id).run();
      return { userId, planDate, itemCount: (items.results ?? []).length };
    }
  }
}
