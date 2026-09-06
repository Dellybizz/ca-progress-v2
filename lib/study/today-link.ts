import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";

// Today starts its persisted timer before recording the existing `today_plan_started`
// planner event. On finish, bind only a plan item whose start event happened after
// this exact timer began and whose academic context matches the timer. Standalone
// Study / Chapter Hub sessions therefore cannot inherit an older Today item.
export async function attachActiveTimerToLatestTodayItem(userId: string, db: HotD1Database = getHotD1Database()) {
  const row = await db.prepare(`SELECT dpi.id
    FROM study_timer_state st
    JOIN study_timer_phase3 sx ON sx.user_id=st.user_id
    JOIN planner_events pe ON pe.user_id=st.user_id AND pe.event_type='today_plan_started'
    JOIN daily_plan_items dpi ON dpi.id=pe.entity_id AND dpi.user_id=pe.user_id
    WHERE st.user_id=?1
      AND sx.task_id IS NULL
      AND sx.plan_item_id IS NULL
      AND datetime(pe.created_at)>=datetime(st.started_at)
      AND (st.subject_id IS NULL OR dpi.subject_id=st.subject_id)
      AND (st.chapter_id IS NULL OR dpi.chapter_id=st.chapter_id)
    ORDER BY datetime(pe.created_at) DESC
    LIMIT 1`).bind(userId).first<{ id: string }>();
  if (!row) return null;
  await db.prepare(`UPDATE study_timer_phase3 SET plan_item_id=?1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?2 AND task_id IS NULL AND plan_item_id IS NULL`).bind(row.id, userId).run();
  return row.id;
}
