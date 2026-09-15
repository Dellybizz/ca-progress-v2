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
  provenance: "admin" | "system_expected" | "official_bridge";
  sourceUrl: string | null;
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

const FALLBACK_UPDATED_AT = "2026-09-15T00:00:00.000Z";
const JANUARY_2026_SOURCE = "https://www.icai.org/post/exam-jan-2026";
const MAY_2026_SOURCE = "https://www.icai.org/post/exam-may-2026";
const FINAL_NOVEMBER_2026_SOURCE =
  "https://resource.cdn.icai.org/93052exam-aps5675-final-guide-nov2026.pdf";

const BUILT_IN_EXAM_DATE_ESTIMATES: AdminExamDateEstimate[] = [
  {
    levelCode: "final",
    attemptKey: "2026-11",
    groupChoice: "group_1",
    estimatedDate: "2026-11-02",
    estimatedEndDate: "2026-11-06",
    note: "ICAI-published Final November 2026 Group I window. Temporary bridge only until verified sync data is available.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "official_bridge",
    sourceUrl: FINAL_NOVEMBER_2026_SOURCE,
  },
  {
    levelCode: "final",
    attemptKey: "2026-11",
    groupChoice: "group_2",
    estimatedDate: "2026-11-09",
    estimatedEndDate: "2026-11-13",
    note: "ICAI-published Final November 2026 Group II window. Temporary bridge only until verified sync data is available.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "official_bridge",
    sourceUrl: FINAL_NOVEMBER_2026_SOURCE,
  },
  {
    levelCode: "final",
    attemptKey: "2026-11",
    groupChoice: "both",
    estimatedDate: "2026-11-02",
    estimatedEndDate: "2026-11-13",
    note: "ICAI-published Final November 2026 exam window. Temporary bridge only until verified sync data is available.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "official_bridge",
    sourceUrl: FINAL_NOVEMBER_2026_SOURCE,
  },
  {
    levelCode: "intermediate",
    attemptKey: "2027-01",
    groupChoice: "group_1",
    estimatedDate: "2027-01-06",
    estimatedEndDate: "2027-01-10",
    note: "Expected only, based on ICAI's January 2026 scheduling cadence. Replaced automatically when verified January 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: JANUARY_2026_SOURCE,
  },
  {
    levelCode: "intermediate",
    attemptKey: "2027-01",
    groupChoice: "group_2",
    estimatedDate: "2027-01-12",
    estimatedEndDate: "2027-01-17",
    note: "Expected only, based on ICAI's January 2026 scheduling cadence. Replaced automatically when verified January 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: JANUARY_2026_SOURCE,
  },
  {
    levelCode: "intermediate",
    attemptKey: "2027-01",
    groupChoice: "both",
    estimatedDate: "2027-01-06",
    estimatedEndDate: "2027-01-17",
    note: "Expected only, based on ICAI's January 2026 scheduling cadence. Replaced automatically when verified January 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: JANUARY_2026_SOURCE,
  },
  {
    levelCode: "foundation",
    attemptKey: "2027-01",
    groupChoice: "not_applicable",
    estimatedDate: "2027-01-18",
    estimatedEndDate: "2027-01-24",
    note: "Expected only, based on ICAI's January 2026 scheduling cadence. Replaced automatically when verified January 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: JANUARY_2026_SOURCE,
  },
  {
    levelCode: "final",
    attemptKey: "2027-05",
    groupChoice: "group_1",
    estimatedDate: "2027-05-02",
    estimatedEndDate: "2027-05-06",
    note: "Expected only, based on ICAI's May 2026 scheduling cadence. Replaced automatically when verified May 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: MAY_2026_SOURCE,
  },
  {
    levelCode: "final",
    attemptKey: "2027-05",
    groupChoice: "group_2",
    estimatedDate: "2027-05-08",
    estimatedEndDate: "2027-05-12",
    note: "Expected only, based on ICAI's May 2026 scheduling cadence. Replaced automatically when verified May 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: MAY_2026_SOURCE,
  },
  {
    levelCode: "final",
    attemptKey: "2027-05",
    groupChoice: "both",
    estimatedDate: "2027-05-02",
    estimatedEndDate: "2027-05-12",
    note: "Expected only, based on ICAI's May 2026 scheduling cadence. Replaced automatically when verified May 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: MAY_2026_SOURCE,
  },
  {
    levelCode: "intermediate",
    attemptKey: "2027-05",
    groupChoice: "group_1",
    estimatedDate: "2027-05-03",
    estimatedEndDate: "2027-05-07",
    note: "Expected only, based on ICAI's May 2026 scheduling cadence. Replaced automatically when verified May 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: MAY_2026_SOURCE,
  },
  {
    levelCode: "intermediate",
    attemptKey: "2027-05",
    groupChoice: "group_2",
    estimatedDate: "2027-05-09",
    estimatedEndDate: "2027-05-13",
    note: "Expected only, based on ICAI's May 2026 scheduling cadence. Replaced automatically when verified May 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: MAY_2026_SOURCE,
  },
  {
    levelCode: "intermediate",
    attemptKey: "2027-05",
    groupChoice: "both",
    estimatedDate: "2027-05-03",
    estimatedEndDate: "2027-05-13",
    note: "Expected only, based on ICAI's May 2026 scheduling cadence. Replaced automatically when verified May 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: MAY_2026_SOURCE,
  },
  {
    levelCode: "foundation",
    attemptKey: "2027-05",
    groupChoice: "not_applicable",
    estimatedDate: "2027-05-14",
    estimatedEndDate: "2027-05-20",
    note: "Expected only, based on ICAI's May 2026 scheduling cadence. Replaced automatically when verified May 2027 dates are synced.",
    updatedAt: FALLBACK_UPDATED_AT,
    provenance: "system_expected",
    sourceUrl: MAY_2026_SOURCE,
  },
];

function estimateKey(
  levelCode: string,
  attemptKey: string,
  groupChoice: string,
) {
  return `${levelCode}:${attemptKey}:${groupChoice}`;
}

function findBuiltInEstimate(
  levelCode: string,
  attemptKey: string,
  groupChoice: string,
) {
  return (
    BUILT_IN_EXAM_DATE_ESTIMATES.find(
      (estimate) =>
        estimate.levelCode === levelCode &&
        estimate.attemptKey === attemptKey &&
        estimate.groupChoice === groupChoice,
    ) ?? null
  );
}

function mapEstimate(row: EstimateRow): AdminExamDateEstimate {
  return {
    levelCode: row.level_code,
    attemptKey: row.attempt_key,
    groupChoice: row.group_choice,
    estimatedDate: row.estimated_date,
    estimatedEndDate: row.estimated_end_date ?? row.estimated_date,
    note: row.note,
    updatedAt: row.updated_at,
    provenance: "admin",
    sourceUrl: null,
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
  return result.data
    ? mapEstimate(result.data as EstimateRow)
    : findBuiltInEstimate(levelCode, attemptKey, groupChoice);
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

  const merged = new Map(
    BUILT_IN_EXAM_DATE_ESTIMATES.map((estimate) => [
      estimateKey(
        estimate.levelCode,
        estimate.attemptKey,
        estimate.groupChoice,
      ),
      estimate,
    ]),
  );
  for (const row of result.data ?? []) {
    const estimate = mapEstimate(row as EstimateRow);
    merged.set(
      estimateKey(
        estimate.levelCode,
        estimate.attemptKey,
        estimate.groupChoice,
      ),
      estimate,
    );
  }

  return [...merged.values()].sort(
    (left, right) =>
      left.attemptKey.localeCompare(right.attemptKey) ||
      left.levelCode.localeCompare(right.levelCode) ||
      left.groupChoice.localeCompare(right.groupChoice),
  );
}
