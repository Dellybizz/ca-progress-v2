"use client";

import Link from "next/link";
import { useState } from "react";
import { MOBILE_STUDENT_FEATURES } from "@/config/mobile-feature-parity";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const LOCAL_KEY = "ca-progress:feature-tour";

export function FeatureTour({
  authenticated,
  initialStep,
  completedAt,
}: {
  authenticated: boolean;
  initialStep: number;
  completedAt: string | null;
}) {
  const [step, setStep] = useState(
    Math.min(initialStep, MOBILE_STUDENT_FEATURES.length - 1),
  );
  const [complete, setComplete] = useState(Boolean(completedAt));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const feature = MOBILE_STUDENT_FEATURES[step];
  async function persist(next: number, completed: boolean) {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        step: next,
        completed,
        updatedAt: new Date().toISOString(),
      }),
    );
    if (!authenticated || !navigator.onLine) {
      setNotice(
        authenticated
          ? "Saved on this device; account sync will resume online."
          : "Saved on this device. Sign in to continue on another device.",
      );
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/feature-tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: next, completed }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          body.error ?? "Tour progress could not be synchronized.",
        );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `${error.message} Progress remains on this device.`
          : "Progress remains on this device.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function move(next: number) {
    const bounded = Math.max(
      0,
      Math.min(MOBILE_STUDENT_FEATURES.length - 1, next),
    );
    setStep(bounded);
    setComplete(false);
    await persist(bounded, false);
  }
  async function finish() {
    setComplete(true);
    await persist(MOBILE_STUDENT_FEATURES.length, true);
  }
  async function restart() {
    setComplete(false);
    setStep(0);
    await persist(0, false);
  }

  if (complete)
    return (
      <section className="feature-tour feature-tour--complete">
        <Icon name="check" size={28} />
        <h1>You know your CA Progress workspace</h1>
        <p>
          The tour is complete. You can restart it whenever the product changes
          or you want a refresher.
        </p>
        <div className="feature-tour__actions">
          <Button onClick={() => void restart()} disabled={saving}>
            Restart tour
          </Button>
          <Link
            className="ui-button ui-button--secondary ui-button--md"
            href="/dashboard"
          >
            Open dashboard
          </Link>
        </div>
        {notice ? <p role="status">{notice}</p> : null}
      </section>
    );
  return (
    <section className="feature-tour" aria-labelledby="feature-tour-title">
      <header>
        <span>
          Feature {step + 1} of {MOBILE_STUDENT_FEATURES.length}
        </span>
        <progress value={step + 1} max={MOBILE_STUDENT_FEATURES.length} />
      </header>
      <div className="feature-tour__body">
        <span className="feature-tour__icon">
          <Icon
            name={
              feature.id === "focus"
                ? "timer"
                : feature.id === "notifications"
                  ? "bell"
                  : feature.id === "notes"
                    ? "notes"
                    : "sparkles"
            }
            size={26}
          />
        </span>
        <p className="eyebrow">
          {feature.offline === "full"
            ? "Works offline"
            : feature.offline === "partial"
              ? "Core actions work offline"
            : feature.offline === "snapshot"
              ? "Available offline as a saved view"
              : "Connection required"}
        </p>
        <h1 id="feature-tour-title">{feature.label}</h1>
        <p>
          {feature.mobileLayout}. {feature.synchronization}.
        </p>
        <dl>
          <div>
            <dt>Access</dt>
            <dd>
              {feature.permission === "guest"
                ? "Guest preview and account use"
                : "Signed-in account"}
            </dd>
          </div>
          <div>
            <dt>If unavailable</dt>
            <dd>{feature.failureState}</dd>
          </div>
          <div>
            <dt>Analytics</dt>
            <dd>{feature.analytics}</dd>
          </div>
        </dl>
        <Link className="feature-tour__open" href={feature.href}>
          Open this feature <Icon name="arrow" size={15} />
        </Link>
      </div>
      <footer>
        <Button
          variant="secondary"
          disabled={saving || step === 0}
          onClick={() => void move(step - 1)}
        >
          Previous
        </Button>
        {step === MOBILE_STUDENT_FEATURES.length - 1 ? (
          <Button disabled={saving} onClick={() => void finish()}>
            Finish tour
          </Button>
        ) : (
          <Button disabled={saving} onClick={() => void move(step + 1)}>
            Next
          </Button>
        )}
      </footer>
      {notice ? (
        <p role="status" className="feature-tour__notice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
