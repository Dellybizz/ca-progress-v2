import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import { getResourceR2Bucket } from "@/lib/resources/r2";
import { runIcaiSync } from "@/lib/icai/sync";
import { generateTodayPlanForUser } from "@/lib/smart-planner/service";
import type { BackgroundJob } from "./queue";

function db(): HotD1Database { return getHotD1Database(); }
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
      const abandoned = await db().prepare("SELECT id,object_key FROM r2_upload_intents WHERE status='issued' AND expires_at < CURRENT_TIMESTAMP LIMIT 100").all();
      try {
        const bucket = getResourceR2Bucket();
        for (const row of (abandoned.results ?? []) as Array<{id:string;object_key:string}>) {
          await bucket.delete(row.object_key).catch(() => undefined);
          await db().prepare("UPDATE r2_upload_intents SET status='abandoned' WHERE id=?1").bind(row.id).run();
        }
      } catch { /* R2 cleanup retries on the next scheduled run. */ }
      return { retentionDays: days, abandonedUploads: abandoned.results?.length ?? 0 };
    }
    case "ai-plan-generation": {
      const userId = typeof job.payload.userId === "string" ? job.payload.userId : null;
      const planDate = typeof job.payload.planDate === "string" ? job.payload.planDate : new Date().toISOString().slice(0, 10);
      if (!userId) throw new Error("AI plan generation requires userId.");
      const generated = await generateTodayPlanForUser(userId, planDate);
      await db().prepare("INSERT INTO student_plan_snapshots(id,user_id,plan_date,status,plan_json,generated_at,source_job_id,updated_at) VALUES(?1,?2,?3,'ready',?4,?5,?6,CURRENT_TIMESTAMP) ON CONFLICT(user_id,plan_date) DO UPDATE SET status='ready',plan_json=excluded.plan_json,generated_at=excluded.generated_at,source_job_id=excluded.source_job_id,error=NULL,updated_at=CURRENT_TIMESTAMP")
        .bind(crypto.randomUUID(), userId, planDate, json({ plan: generated.plan, items: generated.items, forecast: generated.forecast }), generated.plan.generated_at ?? new Date().toISOString(), job.id).run();
      return { userId, planDate, itemCount: generated.items.length };
    }
  }
}
