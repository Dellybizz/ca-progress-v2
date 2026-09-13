import "server-only";

import { createD1AdminClient } from "@/lib/data/d1/client";

export type AdminExamDateEstimate = {
  levelCode: string;
  attemptKey: string;
  groupChoice: string;
  estimatedDate: string;
  estimatedEndDate: string;
  note: string | null;
  updatedAt: string;
};

type EstimateRow = {
  level_code: string;
  attempt_key: string;
  group_choice: string;
  estimated_date: string;
  estimated_end_date: string | null;
  note: string | null;
  updated_at: string;
};

function mapEstimate(row: EstimateRow): AdminExamDateEstimate {
  return {
    levelCode: row.level_code,
    attemptKey: row.attempt_key,
    groupChoice: row.group_choice,
    estimatedDate: row.estimated_date,
    estimatedEndDate: row.estimated_end_date ?? row.estimated_date,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export async function getAdminExamDateEstimate(
  levelCode: string,
  attemptKey: string,
  groupChoice: string,
) {
  const result = await createD1AdminClient()
    .from("admin_exam_date_estimates")
    .select(
      "level_code,attempt_key,group_choice,estimated_date,estimated_end_date,note,updated_at",
    )
    .eq("level_code", levelCode)
    .eq("attempt_key", attemptKey)
    .eq("group_choice", groupChoice)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapEstimate(result.data as EstimateRow) : null;
}

export async function listAdminExamDateEstimates() {
  const result = await createD1AdminClient()
    .from("admin_exam_date_estimates")
    .select(
      "level_code,attempt_key,group_choice,estimated_date,estimated_end_date,note,updated_at",
    )
    .order("attempt_key")
    .order("level_code")
    .order("group_choice");
  if (result.error) throw result.error;
  return (result.data ?? []).map((row: unknown) =>
    mapEstimate(row as EstimateRow),
  );
}
