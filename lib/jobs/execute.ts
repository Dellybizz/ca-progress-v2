import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import { getResourceR2Bucket } from "@/lib/resources/r2";
import { finalizeIcaiSyncContinuation, runIcaiSyncSource, startIcaiSyncContinuation } from "@/lib/icai/sync";
import { runIcaiPhase5ReviewProbe } from "@/lib/icai/phase5";
import { generateTodayPlanForUser } from "@/lib/smart-planner/service";
import { enqueueBackgroundJob, type BackgroundJob } from "./queue";

function db(): HotD1Database { return getHotD1Database(); }
function json(value: unknown) { return JSON.stringify(value ?? {}); }

export async function executeBackgroundJob(job: BackgroundJob) {
  switch (job.type) {
    case "icai-sync": {
      const mode = job.payload.mode;
      if (mode === "source") {
        const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
        const sourceIds = Array.isArray(job.payload.sourceIds) ? job.payload.sourceIds.filter((value): value is string => typeof value === "string") : [];
        const sourceIndex = Number(job.payload.sourceIndex);
        if (!runId || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceIds.length) throw new Error("Invalid ICAI source continuation payload.");
        const sourceId = sourceIds[sourceIndex];
        const result = await runIcaiSyncSource({ runId, sourceId });
        if (result.status === "cancelled") return result;
        if (result.status === "continuing") {
          const cursor = Number(result.cursorOffset ?? 0);
          await enqueueBackgroundJob({
            type: "icai-sync",
            idempotencyKey: `icai-sync-source:${runId}:${sourceIndex}:${sourceId}:cursor:${cursor}`,
            payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex },
            createdBy: job.createdBy ?? null,
            delaySeconds: result.requestIntervalSeconds,
          });
          return result;
        }
        const nextIndex = sourceIndex + 1;
        if (nextIndex < sourceIds.length) {
          const nextSourceId = sourceIds[nextIndex];
          await enqueueBackgroundJob({
            type: "icai-sync",
            idempotencyKey: `icai-sync-source:${runId}:${nextIndex}:${nextSourceId}`,
            payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex: nextIndex },
            createdBy: job.createdBy ?? null,
            delaySeconds: result.requestIntervalSeconds,
          });
          return { ...result, nextSourceId };
        }
        const summary = await finalizeIcaiSyncContinuation({ runId });
        return { ...result, summary };
      }
      const trigger = job.payload.trigger === "manual" ? "manual" : job.payload.trigger === "test" ? "test" : "cron";
      const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : null;
      const started = await startIcaiSyncContinuation({ trigger, requestedBy, orchestrationKey: job.idempotencyKey });
      const firstSourceId = started.sourceIds[0];
      if (!firstSourceId) throw new Error("ICAI continuation returned no active sources.");
      await enqueueBackgroundJob({
        type: "icai-sync",
        idempotencyKey: `icai-sync-source:${started.runId}:0:${firstSourceId}`,
        payload: { ...job.payload, mode: "source", runId: started.runId, sourceIds: started.sourceIds, sourceIndex: 0 },
        createdBy: job.createdBy ?? null,
      });
      return started;
    }
    case "icai-phase5-review-probe":
      return runIcaiPhase5ReviewProbe({ correlationId: String(job.payload.correlationId ?? "") });
    case "analytics-aggregate": {
      const date = typeof job.payload.date === "string" ? job.payload.date : new Date().toISOString().slice(0, 10);
      const rows = await db().prepare("SELECT event_type, COUNT(*) AS event_count FROM dashboard_events WHERE occurred_at >= ?1 AND occurred_aï¾­¢G§²ÚîÆ­yÛŠ
NÂˆÛÛœİX˜[™Û™YH]ØZ]Š
Kœ™\\™J”ÑSPÕYØš™XİÚÙ^H”“ÓHŒ—İ\ØYÚ[[ÈÒT‘Hİ]\ÏIÚ\ÜİYY	ÈS‘^\™\×Ø]ÕT”‘S•ÕSQTÕSTSRULŠK˜[

NÂˆHÂˆÛÛœİXÚÙ]HÙ]™\Ûİ\˜ÙTŒXÚÙ]

NÂˆ›Üˆ
ÛÛœİ›İÈÙˆ
X˜[™Û™Yœ™\İ[ÈÏÈ×JH\È\œ˜^OÚYœİš[™ÎÛØš™XİÚÙ^Nœİš[™ßOŠHÂˆ]ØZ]XÚÙ]™[]J›İË›Øš™XİÚÙ^JK˜Ø]Ú


HOˆ[™Yš[™Y
NÂˆ]ØZ]Š
Kœ™\\™J•TUHŒ—İ\ØYÚ[[ÈÑUİ]\ÏIØX˜[™Û™Y	ÈÒT‘HYOÌHŠK˜š[™
›İËšY
Kœ[Š
NÂˆBˆHØ]ÚÈÊˆŒˆÛX[\™]šY\ÈÛˆH™^ØÚY[Y[‹ˆ
‹ÈBˆ™]\›ˆÈ™][[Û‘^\Îˆ^\ËX˜[™Û™Y\ØYÎˆX˜[™Û™Yœ™\İ[ÏË›[™İÏÈNÂˆBˆØ\ÙH˜ZK\[‹YÙ[™\˜][ÛˆˆÂˆÛÛœİ\Ù\’YH\[Ùˆ›Ø‹œ^[ØY\Ù\’YOOHœİš[™ÈˆÈ›Ø‹œ^[ØY\Ù\’Yˆ[ÂˆÛÛœİ[‘]HH\[Ùˆ›Ø‹œ^[ØYœ[‘]HOOHœİš[™ÈˆÈ›Ø‹œ^[ØYœ[‘]Hˆ™]È]J
KÒTÓÔİš[™Ê
KœÛXÙJL
NÂˆYˆ
]\Ù\’Y
H›İÈ™]È\œ›ÜŠRH[ˆÙ[™\˜][Ûˆ™\]Z\™\È\Ù\’YˆŠNÂˆÛÛœİÙ[™\˜]YH]ØZ]Ù[™\˜]UÙ^T[‘›Ü•\Ù\Š\Ù\’Y[‘]JNÂˆ]ØZ]Š
Kœ™\\™J’S”ÑT•S•ÈİY[Ü[—ÜÛ˜\ÚİÊY\Ù\—ÚY[—Ù]Kİ]\Ë[—ÚœÛÛ‹Ù[™\˜]YØ]Ûİ\˜ÙWÚ›Ø—ÚY\]YØ]
HSQTÊÌKÌ‹ÌË	Ü™XYIËÍÍKÍ‹ÕT”‘S•ÕSQTÕST
HÓˆÓÓ‘“PÕ
\Ù\—ÚY[—Ù]JHÈTUHÑUİ]\ÏIÜ™XYIË[—ÚœÛÛY^ÛYYœ[—ÚœÛÛ‹Ù[™\˜]YØ]Y^ÛYY™Ù[™\˜]YØ]Ûİ\˜ÙWÚ›Ø—ÚYY^ÛYYœÛİ\˜ÙWÚ›Ø—ÚY\œ›ÜS•S\]YØ]PÕT”‘S•ÕSQTÕSTŠBˆ˜š[™
Ü\Ëœ˜[™ÛUURQ

K\Ù\’Y[‘]KœÛÛŠÈ[ˆÙ[™\˜]Yœ[‹][\ÎˆÙ[™\˜]Yš][\Ë›Ü™XØ\İˆÙ[™\˜]Y™›Ü™XØ\İJKÙ[™\˜]Yœ[‹™Ù[™\˜]YØ]ÏÈ™]È]J
KÒTÓÔİš[™Ê
K›Ø‹šY
Kœ[Š
NÂˆ™]\›ˆÈ\Ù\’Y[‘]K][PÛİ[ˆÙ[™\˜]Yš][\Ë›[™İNÂˆBˆBŸB