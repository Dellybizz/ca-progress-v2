import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isPreparationState, type PreparationState } from "@/lib/profile/validation";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{ success?: boolean; results?: T[] }>;
};
type D1Database = { prepare(query: string): D1Statement };

type PreparationRow = { preparation_state: string };

function db(): D1Database {
  const { env } = getCloudflareContext();
  const value = (env as unknown as Record<string, unknown>).DB as D1Database | undefined;
  if (!value || typeof value.prepare !== "function") throw new Error("Cloudflare D1 DB binding is required.");
  return value;
}

export async function getOnboardingPreparationState(userId: string): Promise<PreparationState | null> {
  const row = await db()
    .prepare("SELECT preparation_state FROM onboarding_experience WHERE user_id=?1 LIMIT 1")
    .bind(userId)
    .first<PreparationRow>();
  return isPreparationState(row?.preparation_state) ? row.preparation_state : null;
}

export async function saveOnboardingPreparationState(userId: string, preparationState: PreparationState) {
  const result = await db()
    .prepare(
      "INSERT INTO onboarding_experience(user_id,preparation_state) VALUES(?1,?2) ON CONFLICT(user_id) DO UPDATE SET preparation_state=excluded.preparation_state,updated_at=CURRENT_TIMESTAMP",
    )
    .bind(userId, preparationState)
    .run();
  if (result.success === false) throw new Error("D1 onboarding preparation state update failed.");
}
