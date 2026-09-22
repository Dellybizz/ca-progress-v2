import "server-only";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export class FeatureTourStorageUnavailableError extends Error {
  constructor() {
    super("Feature Tour account sync is not ready yet.");
    this.name = "FeatureTourStorageUnavailableError";
  }
}

function isFeatureTourSchemaUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /no such column/i.test(message) &&
    /feature_tour_(?:step|completed_at)/i.test(message)
  );
}

export async function getFeatureTourProgress(userId: string) {
  try {
    const row = await getD1RuntimeDatabase()
      .prepare(
        "SELECT feature_tour_step,feature_tour_completed_at FROM profiles WHERE user_id=?1 LIMIT 1",
      )
      .bind(userId)
      .first<{
        feature_tour_step: number;
        feature_tour_completed_at: string | null;
      }>();
    return {
      step: Math.max(0, Math.min(14, Number(row?.feature_tour_step ?? 0))),
      completedAt: row?.feature_tour_completed_at ?? null,
      cloudReady: true,
    };
  } catch (error) {
    return {
      step: 0,
      completedAt: null,
      cloudReady: false,
      reason: isFeatureTourSchemaUnavailable(error)
        ? "migration-pending"
        : "storage-unavailable",
    };
  }
}

export async function saveFeatureTourProgress(
  userId: string,
  step: number,
  completed: boolean,
) {
  const safeStep = Math.max(0, Math.min(14, Math.round(step)));
  try {
    await getD1RuntimeDatabase()
      .prepare(
        "UPDATE profiles SET feature_tour_step=?1,feature_tour_completed_at=CASE WHEN ?2=1 THEN COALESCE(feature_tour_completed_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE user_id=?3",
      )
      .bind(safeStep, completed ? 1 : 0, userId)
      .run();
  } catch {
    // Tour progress is optional product state. Keep the local copy usable
    // when preview bindings or D1 are temporarily unavailable.
    throw new FeatureTourStorageUnavailableError();
  }
  return getFeatureTourProgress(userId);
}
