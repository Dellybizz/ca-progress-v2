import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import {
  ensureIcaiSourceSchedules,
  getIcaiScheduleOverview,
  getIcaiSourceScheduleStates,
  type IcaiScheduleOverview,
  type IcaiSourceScheduleState,
} from "./scheduler";

export type IcaiScheduleAdminSource = IcaiSourceScheduleState & {
  name: string;
  officialUrl: string;
  trustLevel: string;
  isActive: boolean;
};

export type IcaiScheduleAdminData = {
  overview: IcaiScheduleOverview;
  windows: Array<{ key: string; label: string }>;
  sources: IcaiScheduleAdminSource[];
};

export async function getIcaiScheduleAdminData(): Promise<IcaiScheduleAdminData> {
  const db = getD1RuntimeDatabase();
  await ensureIcaiSourceSchedules(db);
  const [overview, scheduleStates, sourceRows, windowRows] = await Promise.all([
    getIcaiScheduleOverview(db),
    getIcaiSourceScheduleStates(db),
    db
      .prepare(
        "SELECT id,name,official_url,trust_level,is_active FROM icai_sources ORDER BY name,id",
      )
      .all<{
        id: string;
        name: string;
        official_url: string;
        trust_level: string;
        is_active: number | boolean;
      }>(),
    db
      .prepare(
        "SELECT window_key,label FROM icai_sync_schedule_windows WHERE enabled=1 AND window_kind='source' ORDER BY sort_order,ist_hour",
      )
      .all<{ window_key: string; label: string }>(),
  ]);
  const sourceById = new Map(
    (sourceRows.results ?? []).map((row) => [row.id, row]),
  );
  const sources = scheduleStates.flatMap((state) => {
    const source = sourceById.get(state.sourceId);
    if (!source) return [];
    return [
      {
        ...state,
        name: source.name,
        officialUrl: source.official_url,
        trustLevel: source.trust_level,
        isActive: Boolean(source.is_active),
      },
    ];
  });
  return {
    overview,
    windows: (windowRows.results ?? []).map((row) => ({
      key: row.window_key,
      label: row.label,
    })),
    sources,
  };
}
