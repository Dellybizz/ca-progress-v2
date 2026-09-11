// Apply academic scope before LIMIT so other papers and notices cannot hide a date.
export function dashboardExamQuery(attemptId: string, subjectIds: string[], today: string) {
  const ids = [...new Set(subjectIds)];
  const subjectClause = ids.length ? `subject_id IN (${ids.map(() => "?").join(",")})` : "0=1";
  return {
    sql: `SELECT id,attempt_id,subject_id,title,event_type,event_date,source_url,last_seen_at,verification_status
      FROM exam_events
      WHERE attempt_id=? AND verification_status='verified' AND event_date>=?
        AND event_type IN ('exam_start','exam_paper')
        AND ((subject_id IS NULL AND event_type='exam_start') OR ${subjectClause})
      ORDER BY event_date,id LIMIT 24`,
    values: [attemptId, today, ...ids],
  };
}
