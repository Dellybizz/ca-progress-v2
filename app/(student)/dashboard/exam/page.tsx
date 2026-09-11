import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getDashboardPageModel } from "@/lib/dashboard/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exam countdown | CA Progress" };

function dateLabel(value: string | null) {
  if (!value) return "Date not yet approved";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

export default async function ExamCountdownPage() {
  const model = await getDashboardPageModel();
  if (model.mode !== "ready")
    return (
      <EmptyState
        icon="clock"
        title="Exam details are not available"
        description="Sign in and complete your academic setup to see the exam date for your selected attempt."
      />
    );
  const countdown = model.countdown;
  return (
    <div className="dashboard-exam-page">
      <Link href="/dashboard" className="ui-text-link">
        ← Back to dashboard
      </Link>
      <PageHeader
        preview={false}
        eyebrow={`${model.context.levelName} · ${model.context.groupLabel}`}
        title={model.context.attemptLabel}
        description="Official ICAI dates take priority. CA Progress admins may publish a clearly labelled planning estimate until ICAI confirms the timetable."
      />
      {countdown.status === "awaiting_verified_date" ? (
        <EmptyState
          icon="clock"
          title="Official exam date is awaiting approval"
          description="No official ICAI date or CA Progress provisional date is available for this selection yet."
        />
      ) : (
        <Card>
          <CardBody>
            <div className="dashboard-exam-detail">
              <span>
                <Icon name="calendar" size={22} />
              </span>
              <div>
                <small>
                  {countdown.sourceKind === "admin_estimate"
                    ? "Provisional exam date"
                    : "Approved exam date"}
                </small>
                <h2>
                  {dateLabel(countdown.targetDate)}
                  {countdown.endDate &&
                  countdown.endDate !== countdown.targetDate
                    ? ` – ${dateLabel(countdown.endDate)}`
                    : ""}
                </h2>
                <p>
                  {countdown.status === "exam_period"
                    ? "Exam period"
                    : countdown.status === "completed"
                      ? "Exam completed"
                      : `${countdown.daysRemaining} day${countdown.daysRemaining === 1 ? "" : "s"} remaining in IST.`}
                </p>
                {countdown.sourceKind === "admin_estimate" ? (
                  <p>
                    This planning estimate was published by CA Progress. The
                    ICAI sync engine will automatically replace it when an
                    official timetable is verified.
                  </p>
                ) : null}
              </div>
            </div>
            {countdown.sourceUrl ? (
              <a
                className="ui-button ui-button--secondary"
                href={countdown.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open official ICAI evidence <Icon name="arrow" size={14} />
              </a>
            ) : null}
          </CardBody>
        </Card>
      )}
      {countdown.conflictWarning ? (
        <div className="auth-status auth-status--warning" role="alert">
          {countdown.conflictWarning}
        </div>
      ) : null}
    </div>
  );
}
