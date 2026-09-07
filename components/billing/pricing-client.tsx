"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { BillingCycle, PlanEntitlement, SubscriptionPlan } from "@/lib/billing/service";
import { PLAN_COMPARISON_COLUMNS, PLAN_COMPARISON_ROWS, planComparisonValue } from "@/lib/billing/plan-comparison.mjs";
import { monthlyPriceInr, productPlanLabel, storageQuotaMegabytes } from "@/lib/billing/plan-policy.mjs";

type CheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open(): void;
  on?(event: string, callback: (response: unknown) => void): void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function loadCheckout() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function canonicalPrice(plan: SubscriptionPlan, cycle: Exclude<BillingCycle, "free">) {
  const monthly = monthlyPriceInr(plan.tier_key);
  const rupees = cycle === "annual" ? monthly * 12 : monthly;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

function checkoutMatchesPolicy(plan: SubscriptionPlan, cycle: Exclude<BillingCycle, "free">) {
  if (plan.tier_key === "free") return true;
  const multiplier = cycle === "annual" ? 12 : 1;
  return Boolean(plan.checkout_enabled) && plan.currency === "INR" && plan.price_subunits === monthlyPriceInr(plan.tier_key) * multiplier * 100;
}

function storageLabel(plan: SubscriptionPlan) {
  const megabytes = storageQuotaMegabytes(plan.tier_key);
  return megabytes >= 1024 ? `${Number((megabytes / 1024).toFixed(1))} GB private storage` : `${megabytes} MB private storage`;
}

export function PricingClient({
  plans,
  authenticated,
  currentPlanId,
}: {
  plans: SubscriptionPlan[];
  entitlements: PlanEntitlement[];
  authenticated: boolean;
  currentPlanId: string | null;
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<Exclude<BillingCycle, "free">>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const visible = useMemo(
    () =>
      [
        plans.find((plan) => plan.tier_key === "free"),
        plans.find((plan) => plan.tier_key === "basic" && plan.billing_cycle === cycle),
        plans.find((plan) => plan.tier_key === "pro" && plan.billing_cycle === cycle),
      ].filter(Boolean) as SubscriptionPlan[],
    [plans, cycle],
  );
  const currentTier = plans.find((plan) => plan.id === currentPlanId)?.tier_key ?? null;

  async function purchase(plan: SubscriptionPlan) {
    if (plan.tier_key === "free") {
      router.push("/dashboard");
      return;
    }
    if (!authenticated) {
      router.push(`/login?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    if (!checkoutMatchesPolicy(plan, cycle)) {
      setNotice({
        tone: "info",
        text: `${productPlanLabel(plan.tier_key)} checkout is disabled until the billing row matches the canonical ₹${monthlyPriceInr(plan.tier_key)}/month Product Phase 15 price.`,
      });
      return;
    }

    setBusy(plan.id);
    setNotice(null);
    try {
      const loaded = await loadCheckout();
      if (!loaded || !window.Razorpay) {
        throw new Error("Razorpay Checkout could not be loaded. Check your connection and retry.");
      }

      const orderResponse = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const order = (await orderResponse.json()) as {
        error?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        planName?: string;
        billingCycle?: string;
        keyId?: string;
      };
      if (!orderResponse.ok || !order.orderId || !order.keyId) {
        throw new Error(order.error || "Could not create a secure payment order.");
      }

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "CA Progress",
        description: `${productPlanLabel(plan.tier_key)} · ${order.billingCycle}`,
        order_id: order.orderId,
        retry: { enabled: true, max_count: 3 },
        theme: { color: "#4f46e5" },
        modal: {
          ondismiss: () => {
            setBusy(null);
            setNotice({ tone: "info", text: "Checkout closed. No plan change was made." });
          },
        },
        handler: async (result: CheckoutResult) => {
          setNotice({
            tone: "info",
            text: "Payment received. Verifying it with Razorpay before activating your plan…",
          });
          try {
            const verifyResponse = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(result),
            });
            const verified = (await verifyResponse.json()) as {
              error?: string;
              providerStatus?: string;
              reconciliation?: { status?: string };
            };
            setBusy(null);
            if (!verifyResponse.ok || verified.providerStatus !== "captured") {
              router.push("/billing?payment=pending");
              return;
            }
            router.push("/billing?payment=success");
          } catch {
            setBusy(null);
            router.push("/billing?payment=pending");
          }
        },
      });

      checkout.on?.("payment.failed", () => {
        setBusy(null);
        router.push("/billing?payment=failed");
      });
      checkout.open();
    } catch (error) {
      setBusy(null);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not start secure checkout.",
      });
    }
  }

  return (
    <div className="phase11-pricing">
      <div className="phase11-cycle" role="group" aria-label="Billing cycle">
        <button className={cycle === "monthly" ? "is-active" : ""} onClick={() => setCycle("monthly")}>
          Monthly
        </button>
        <button className={cycle === "annual" ? "is-active" : ""} onClick={() => setCycle("annual")}>
          Annual
        </button>
      </div>

      {notice ? (
        <div className={`phase11-notice phase11-notice--${notice.tone}`} role="status">
          {notice.text}
        </div>
      ) : null}

      <section className="phase11-plan-grid" aria-label="CA Progress plans">
        {visible.map((plan) => {
          const current = plan.tier_key === currentTier;
          const configured = checkoutMatchesPolicy(plan, cycle);
          const productLabel = productPlanLabel(plan.tier_key);
          return (
            <article
              key={plan.id}
              className={`phase11-plan-card phase11-plan-card--${plan.tier_key} ${current ? "is-current" : ""}`}
            >
              <div className="phase11-plan-top">
                <div>
                  <span className="phase11-tier">{productLabel}</span>
                  <h2>{productLabel}</h2>
                </div>
                {current ? (
                  <span className="phase11-current">
                    <Icon name="check" size={14} />Current
                  </span>
                ) : plan.tier_key === "pro" ? (
                  <span className="phase11-popular">
                    <Icon name="sparkles" size={14} />Full access
                  </span>
                ) : null}
              </div>
              <p>{plan.tier_key === "free" ? "A complete core study system with no payment required." : plan.tier_key === "basic" ? "Advanced planning, exports and collaboration for active students." : "The deepest insight, history and backup layer."}</p>
              <div className="phase11-price">
                <strong>{canonicalPrice(plan, cycle)}</strong>
                <span>/{cycle === "monthly" ? "month" : "year"}</span>
              </div>
              <ul>
                <li><Icon name="check" size={16} />Core Today → Study → Progress loop</li>
                <li><Icon name="check" size={16} />{storageLabel(plan)}</li>
                <li><Icon name="check" size={16} />{plan.tier_key === "free" ? "Core Analytics, Buddy and gamification" : plan.tier_key === "basic" ? "Advanced planner, CSV exports and expanded Buddy" : "Premium insights, full history and full backup"}</li>
                <li><Icon name="shield" size={16} />Server-enforced account access</li>
              </ul>
              <button
                className={`ui-button ${plan.tier_key === "pro" ? "ui-button--primary" : "ui-button--secondary"}`}
                disabled={busy === plan.id || current}
                onClick={() => void purchase(plan)}
              >
                {current
                  ? "Current plan"
                  : busy === plan.id
                    ? "Starting secure checkout…"
                    : plan.tier_key === "free"
                      ? "Continue free"
                      : configured
                        ? `Choose ${productLabel}`
                        : "Checkout not configured"}
              </button>
              {!configured && plan.tier_key !== "free" ? (
                <small className="phase11-config-note">
                  Checkout stays locked if the server billing row differs from the canonical Product Phase 15 price.
                </small>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="phase15-plan-comparison" aria-labelledby="phase15-plan-comparison-title">
        <div className="phase11-security-note">
          <Icon name="sparkles" />
          <div>
            <strong id="phase15-plan-comparison-title">Compare plans</strong>
            <p>Free remains genuinely usable. Paid plans add capability without deleting existing data when you later downgrade.</p>
          </div>
        </div>
        <div className="phase15-plan-comparison__scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Capability</th>
                {PLAN_COMPARISON_COLUMNS.map((column) => (
                  <th scope="col" key={column.tier}>
                    {column.label}<br/><small>₹{column.monthlyPriceInr}/month{currentTier === column.tier ? " · Current" : ""}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}<small>{row.detail}</small></th>
                  {PLAN_COMPARISON_COLUMNS.map((column) => (
                    <td key={column.tier}>{planComparisonValue(row, column.tier)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="phase11-security-note">
        <Icon name="shield" />
        <div>
          <strong>Payment and feature state are never trusted from the browser.</strong>
          <p>
            The server resolves the authenticated account, applies subscription lifecycle rules, checks paid feature floors, and independently verifies Razorpay payment state before activating a plan.
          </p>
        </div>
      </div>
    </div>
  );
}
