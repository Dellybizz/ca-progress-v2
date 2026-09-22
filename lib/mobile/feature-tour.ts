import "server-only";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export async function getFeatureTourProgress(userId: string) {
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
  };
}

export async function saveFeatureTourProgress(
  userId: string,
  step: number,
  completed: boolean,
) {
  const safeStep = Math.max(0, Math.min(14, Math.round(step)));
  await getD1RuntimeDatabase()
    .prepare(
      "UPDATE profiles SET feature_tour_step=?1,feature_tour_completed_at=CASE WHEN ?2=1 THEN COALESCE(feature_tour_completed_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE user_id=?3",
    )
    .bind(safeStep, completed ? 1 : 0, userId)
    .run();
  return getFeatureTourProgress(userId);
}
