"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { BillingCycle, PlanEntitlement, SubscriptionPlan } from "@/lib/billing/service";

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

function money(plan: SubscriptionPlan) {
  if (plan.tier_key === "free") return "Free";
  if (plan.price_subunits === null) return "Price pending";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: plan.currency,
    maximumFractionDigits: 0,
  }).format(plan.price_subunits / 100);
}

function storageLabel(entitlements: PlanEntitlement[], planId: string) {
  const rule = entitlements.find(
    (item) => item.plan_id === planId && item.feature_key === "resources.storage",
  );
  if (!rule || rule.limit_value === null) {
    return "Private resource storage allowance pending configuration";
  }
  return `${Number(rule.limit_value).toLocaleString("en-IN")} MB private resource storage`;
}

export function PricingClient({
  plans,
  entitlements,
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

  async function purchase(plan: SubscriptionPlan) {
    if (plan.tier_key === "free") {
      router.push("/dashboard");
      return;
    }
    if (!authenticated) {
      router.push(`/login?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    if (!plan.checkout_enabled || plan.price_subunits === null) {
      setNotice({
        tone: "info",
        text: `${plan.name} checkout is intentionally disabled until its server-side price and Razorpay staging credentials are configured.`,
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
        description: `${order.planName} · ${order.billingCycle}`,
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
            if (!verifyResponse.ok) {
              router.push("/billing?payment=pending");
              return;
            }
            if (verified.providerStatus !== "captured") {
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

      <section className="phase11-plan-grid">
        {visible.map((plan) => {
          const current = plan.id === currentPlanId;
          const configured =
            plan.tier_key === "free" || (plan.checkout_enabled && plan.price_subunits !== null);
          return (
            <article
              key={plan.id}
              className={`phase11-plan-card phase11-plan-card--${plan.tier_key} ${current ? "is-current" : ""}`}
            >
              <div className="phase11-plan-top">
                <div>
                  <span className="phase11-tier">{plan.tier_key}</span>
                  <h2>{plan.name}</h2>
                </div>
                {current ? (
                  <span className="phase11-current">
                    <Icon name="check" size={14} />Current
                  </span>
                ) : plan.tier_key === "pro" ? (
                  <span className="phase11-popular">
                    <Icon name="sparkles" size={14} />Highest allowance
                  </span>
                ) : null}
              </div>
              <p>{plan.tagline}</p>
              <div className="phase11-price">
                <strong>{money(plan)}</strong>
                {plan.tier_key !== "free" && plan.price_subunits !== null ? (
                  <span>/{cycle === "monthly" ? "month" : "year"}</span>
                ) : null}
              </div>
              <ul>
                <li><Icon name="check" size={16} />Full current V2 study toolkit</li>
                <li><Icon name="check" size={16} />Smart Planner, forecast and Community</li>
                <li><Icon name="check" size={16} />{storageLabel(entitlements, plan.id)}</li>
                <li><Icon name="shield" size={16} />Server-enforced account entitlements</li>
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
                        ? `Choose ${plan.name}`
                        : "Checkout not configured"}
              </button>
              {!configured && plan.tier_key !== "free" ? (
                <small className="phase11-config-note">
                  No price is invented in V2. This plan becomes purchasable only after a server-side staging price and Razorpay credentials are configured.
                </small>
              ) : null}
            </article>
          );
        })}
      </section>

      <div className="phase11-security-note">
        <Icon name="shield" />
        <div>
          <strong>Payment state is never trusted from the browser.</strong>
          <p>
            The server creates the Razorpay amount from the selected plan row, verifies checkout signatures and Razorpay payment state, and independently reconciles signed webhooks.
          </p>
        </div>
      </div>
    </div>
  );
}
