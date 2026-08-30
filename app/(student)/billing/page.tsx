import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getBillingModel } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing | CA Progress" };

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
}

function PaymentState({ state }: { state?: string }) {
  if (state === "success") {
    return (
      <div className="phase11-notice phase11-notice--success" role="status">
        Payment verified with Razorpay. The plan and history below are read from server-reconciled billing state.
      </div>
    );
  }
  if (state === "pending") {
    return (
      <div className="phase11-notice phase11-notice--info" role="status">
        Payment is awaiting capture or reconciliation. Your plan changes only after Razorpay confirms the payment; signed webhooks can complete reconciliation independently.
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="phase11-notice phase11-notice--error" role="alert">
        <span>Payment failed or was not captured. Your current plan was not changed.</span>{" "}
        <Link href="/pricing">Retry payment</Link>
      </div>
    );
  }
  return null;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const model = await getBillingModel();
  const query = await searchParams;
  if (model.mode === "guest") {
    return (
      <div className="phase11-page">
        <LoginRequired next="/billing" title="Sign in to view billing" />
      </div>
    );
  }

  const plan = model.currentPlan!;
  return (
    <div className="phase11-page">
      <PageHeader
        preview={false}
        eyebrow="Billing"
        title="Subscription and payment history"
        description="Your active plan is derived on the server from unexpired subscription periods. Payment and subscription audit records remain separate and traceable."
        actions={
          <div className="phase11-header-links">
            <Link href="/pricing">Compare plans</Link>
            <Link href="/settings">Settings</Link>
          </div>
        }
      />

      <PaymentState state={query.payment} />

      <section className="phase11-billing-grid">
        <Card className="phase11-current-plan">
          <CardHeader title="Current plan" description="Server-enforced access" />
          <CardBody>
            <div className="phase11-current-plan__hero">
              <span><Icon name="shield" /></span>
              <div>
                <small>{plan.tier_key.toUpperCase()}</small>
                <strong>{plan.name}</strong>
                <p>{plan.tagline}</p>
              </div>
            </div>
            <dl className="phase11-current-plan__details">
              <div><dt>Billing cycle</dt><dd>{plan.billing_cycle}</dd></div>
              <div><dt>Status</dt><dd>{model.currentSubscription?.status ?? "Free fallback"}</dd></div>
              <div><dt>Valid from</dt><dd>{date(model.currentSubscription?.starts_at)}</dd></div>
              <div><dt>Active until</dt><dd>{model.currentSubscription?.ends_at ? date(model.currentSubscription.ends_at) : "No expiry"}</dd></div>
            </dl>
            <Link className="ui-button ui-button--primary" href="/pricing">Manage plan</Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Renewal state"
            description="Phase 11 uses explicit purchased durations, not a hardcoded month."
          />
          <CardBody>
            <div className="phase11-renewal">
              <Icon name="clock" />
              <div>
                <strong>{plan.tier_key === "free" ? "No renewal required" : "Manual renewal"}</strong>
                <p>
                  {plan.tier_key === "free"
                    ? "Free access continues unless the server plan matrix changes."
                    : "Each successful purchase grants the exact duration configured on the server plan row. Buying the same tier again extends from the existing expiry instead of shortening it."}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="Payment history" description="Razorpay orders and verified settlement state." />
        <CardBody>
          {model.payments?.length ? (
            <div className="phase11-table-wrap">
              <table className="phase11-table">
                <thead>
                  <tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Provider reference</th><th>Recovery</th></tr>
                </thead>
                <tbody>
                  {model.payments.map((payment) => {
                    const paymentPlan = model.plans?.find((item) => item.id === payment.plan_id);
                    return (
                      <tr key={payment.id}>
                        <td>{date(payment.created_at)}</td>
                        <td>{paymentPlan?.name ?? "Plan"} {paymentPlan?.billing_cycle !== "free" ? `· ${paymentPlan?.billing_cycle ?? ""}` : ""}</td>
                        <td>{money(payment.amount_subunits, payment.currency)}</td>
                        <td><span className={`phase11-payment-status phase11-payment-status--${payment.status}`}>{payment.status}</span></td>
                        <td><code>{payment.provider_payment_id ?? payment.provider_order_id}</code></td>
                        <td>{payment.status === "failed" ? <Link href="/pricing">Retry</Link> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="phase11-empty">
              <Icon name="shield" />
              <strong>No paid transactions yet</strong>
              <p>Secure Razorpay purchases and their reconciliation history will appear here.</p>
              <Link href="/pricing">View plans</Link>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Subscription audit" description="Idempotent grant and extension events." />
        <CardBody>
          {model.events?.length ? (
            <div className="phase11-event-list">
              {model.events.map((event) => {
                const eventPlan = model.plans?.find((item) => item.id === event.plan_id);
                return (
                  <div key={event.id}>
                    <span className="phase11-event-icon"><Icon name="check" size={15} /></span>
                    <div>
                      <strong>{event.event_type} · {eventPlan?.name ?? "Plan"}</strong>
                      <p>{date(event.starts_at)} → {event.ends_at ? date(event.ends_at) : "No expiry"}</p>
                    </div>
                    <time>{date(event.created_at)}</time>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="phase11-mini-empty">No subscription grant or extension events yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
