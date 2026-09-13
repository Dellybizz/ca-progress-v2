export type FirstWeekPrompt = {
  day: 1 | 2 | 3 | 4 | 5 | 7;
  title: string;
  body: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  shareText?: string;
};

export type FirstWeekEvidence = {
  onboardingCompletedAt: string | null;
  today: string;
  timezone: string;
  yesterdayStudyMinutes: number;
  streakDays: number;
  weekStudyMinutes: number;
  completedPlanItems: number;
  completedChapters: number;
  totalChapters: number;
};

function dateKeyInTimezone(timezone: string, at: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

function dayDifference(later: string, earlier: string) {
  const laterDate = new Date(`${later}T12:00:00.000Z`);
  const earlierDate = new Date(`${earlier}T12:00:00.000Z`);
  if (!Number.isFinite(laterDate.valueOf()) || !Number.isFinite(earlierDate.valueOf())) return null;
  return Math.floor((laterDate.valueOf() - earlierDate.valueOf()) / 86_400_000);
}

export function getFirstWeekDay(onboardingCompletedAt: string | null, today: string, timezone: string) {
  if (!onboardingCompletedAt) return null;
  const completed = new Date(onboardingCompletedAt);
  if (!Number.isFinite(completed.valueOf())) return null;
  const completedDay = dateKeyInTimezone(timezone, completed);
  const difference = dayDifference(today, completedDay);
  if (difference === null || difference < 0 || difference > 6) return null;
  return difference + 1;
}

export function buildFirstWeekPrompt(evidence: FirstWeekEvidence): FirstWeekPrompt | null {
  const day = getFirstWeekDay(evidence.onboardingCompletedAt, evidence.today, evidence.timezone);
  if (day === 1) return {
    day: 1,
    title: "Day 1 · Build your real starting point",
    body: "Review your course, mark only progress you have actually completed, then record one study session. Today works even if your history is still empty.",
    primaryLabel: "Mark progress",
    primaryHref: "/progress",
    secondaryLabel: "Start Study",
    secondaryHref: "/study",
  };
  if (day === 2) return {
    day: 2,
    title: "Day 2 · Yesterday’s study",
    body: evidence.yesterdayStudyMinutes > 0
      ? `${evidence.yesterdayStudyMinutes} minutes were recorded yesterday. That is the history CA Progress can use today.`
      : "No study session was recorded yesterday. Nothing is inferred from the gap—record a session today when you study.",
    primaryLabel: "Start Study",
    primaryHref: "/study",
  };
  if (day === 3) return {
    day: 3,
    title: "Day 3 · Recorded streak",
    body: evidence.streakDays > 0
      ? `Your recorded study streak is ${evidence.streakDays} day${evidence.streakDays === 1 ? "" : "s"}. Only finished study sessions count.`
      : "There is no recorded study streak yet. Start and finish a study session to begin one.",
    primaryLabel: "Start Study",
    primaryHref: "/study",
  };
  if (day === 4) return {
    day: 4,
    title: "Day 4 · Consider Study Buddy later",
    body: "Study Buddy can become an optional accountability layer later. It is not required for Today, planning or core study functionality.",
    primaryLabel: "Open Community",
    primaryHref: "/community",
  };
  if (day === 5) {
    const completion = evidence.totalChapters ? Math.round((evidence.completedChapters / evidence.totalChapters) * 100) : 0;
    return {
      day: 5,
      title: "Day 5 · Your first analytics check",
      body: `${evidence.weekStudyMinutes} recorded study minutes and ${completion}% of applicable chapters marked complete so far. These are recorded values, not estimates of ability.`,
      primaryLabel: "View Analytics",
      primaryHref: "/analytics",
    };
  }
  if (day === 7) {
    const shareText = `My first CA Progress week: ${evidence.weekStudyMinutes} recorded study minutes, ${evidence.completedPlanItems} completed Today items, ${evidence.completedChapters}/${evidence.totalChapters} applicable chapters marked complete.`;
    return {
      day: 7,
      title: "Your First CA Progress Week",
      body: `${evidence.weekStudyMinutes} recorded study minutes · ${evidence.completedPlanItems} completed Today items · ${evidence.completedChapters}/${evidence.totalChapters} applicable chapters marked complete.`,
      primaryLabel: "View Analytics",
      primaryHref: "/analytics",
      shareText,
    };
  }
  return null;
}
