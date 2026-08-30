import type { PlannerCandidate } from "./types";

export type RankedSelection = {
  selected: PlannerCandidate[];
  plannedMinutes: number;
  urgentMinutes: number;
  overTarget: boolean;
};

export function selectDailyCandidates(
  candidates: PlannerCandidate[],
  targetMinutes: number,
  blockedSourceKeys: Set<string> = new Set(),
): RankedSelection {
  const available = candidates
    .filter((candidate) => !blockedSourceKeys.has(candidate.sourceKey))
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
      return a.sourceKey.localeCompare(b.sourceKey);
    });

  const selected: PlannerCandidate[] = [];
  const seenChapters = new Set<string>();
  let plannedMinutes = 0;
  let urgentMinutes = 0;

  for (const candidate of available) {
    if (candidate.urgent) {
      selected.push(candidate);
      plannedMinutes += candidate.estimatedMinutes;
      urgentMinutes += candidate.estimatedMinutes;
      if (candidate.chapterId) seenChapters.add(candidate.chapterId);
    }
  }

  for (const candidate of available) {
    if (candidate.urgent || selected.some((item) => item.sourceKey === candidate.sourceKey)) continue;
    if (candidate.chapterId && seenChapters.has(candidate.chapterId) && candidate.itemKind === "new_chapter") continue;
    if (plannedMinutes + candidate.estimatedMinutes > targetMinutes) continue;
    selected.push(candidate);
    plannedMinutes += candidate.estimatedMinutes;
    if (candidate.chapterId) seenChapters.add(candidate.chapterId);
  }

  return {
    selected,
    plannedMinutes,
    urgentMinutes,
    overTarget: urgentMinutes > targetMinutes,
  };
}
