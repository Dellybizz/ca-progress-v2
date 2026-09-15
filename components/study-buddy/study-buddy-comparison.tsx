import { Card } from "@/components/ui/card";
import type { StudyBuddyComparisonItem } from "@/lib/study-buddy/comparison";

function metric(value: number | null, suffix: string) {
  return value == null ? "Not shared" : `${value} ${suffix}`;
}

export function StudyBuddyComparison({ items }: { items: StudyBuddyComparisonItem[] }) {
  if (!items.length) return null;

  return <section className="study-buddy-grid" aria-label="Study Buddy accountability comparison">
    {items.map((item) => <Card key={item.relationshipId} className="study-buddy-card">
      <div className="study-buddy-card-head">
        <div><h2>{item.displayName}</h2><small>{item.userId}</small></div>
        <span className="study-buddy-pill study-buddy-pill--accepted">Accountability</span>
      </div>
      <div className="study-buddy-accountability">
        <h3>Today · week · target · streak</h3>
        <dl>
          <dt>Today</dt><dd>{metric(item.todayStudyMinutes, "min")}</dd>
          <dt>Last 7 days</dt><dd>{metric(item.weekStudyMinutes, "min")}</dd>
          <dt>Weekly target</dt><dd>{metric(item.weeklyTargetMinutes, "min each")}</dd>
          <dt>Current streak</dt><dd>{metric(item.currentStreakDays, "days")}</dd>
        </dl>
        <p className="study-buddy-muted">Each metric appears only when the buddy has permitted that relationship field. Shared targets require both buddies to opt in.</p>
      </div>
    </Card>)}
  </section>;
}
