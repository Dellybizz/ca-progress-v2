"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import {
  attemptAppliesToLevel,
  isPreparationState,
  type AttemptOption,
  type CALevel,
  type GroupChoice,
  type PreparationState,
} from "@/lib/profile/validation";

type InitialProfile = {
  ca_level: string | null;
  group_choice: string | null;
  attempt_key: string | null;
  onboarding_step: number;
  preparation_state: PreparationState | null;
};

const PREPARATION_OPTIONS: Array<{
  value: PreparationState;
  label: string;
  detail: string;
}> = [
  {
    value: "starting",
    label: "Starting now",
    detail: "I have not built meaningful progress yet.",
  },
  {
    value: "studying",
    label: "Studying the syllabus",
    detail: "I am currently covering new chapters.",
  },
  {
    value: "revising",
    label: "Revising completed portions",
    detail: "I have covered material and am revisiting it.",
  },
  {
    value: "practice",
    label: "Mainly tests and practice",
    detail: "My current focus is question practice and tests.",
  },
];

export function OnboardingWizard({
  initialProfile,
  attempts,
  next,
}: {
  initialProfile: InitialProfile;
  attempts: AttemptOption[];
  next: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(
    Math.min(4, Math.max(1, initialProfile.onboarding_step || 1)),
  );
  const [level, setLevel] = useState<CALevel | "">(
    (initialProfile.ca_level as CALevel | null) ?? "",
  );
  const [group, setGroup] = useState<GroupChoice | "">(
    (initialProfile.group_choice as GroupChoice | null) ?? "",
  );
  const [attemptKey, setAttemptKey] = useState(
    initialProfile.attempt_key ?? "",
  );
  const [preparationState, setPreparationState] = useState<
    PreparationState | ""
  >(initialProfile.preparation_state ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const effectiveGroup = level === "foundation" ? "not_applicable" : group;
  const prerequisitesReady = Boolean(
    level && (level === "foundation" || group),
  );
  const applicableAttempts = useMemo(
    () =>
      prerequisitesReady && level
        ? attempts.filter((option) => attemptAppliesToLevel(option, level))
        : [],
    [attempts, level, prerequisitesReady],
  );
  const selectedAttemptKey = applicableAttempts.some(
    (option) => option.key === attemptKey,
  )
    ? attemptKey
    : "";
  const attemptLabel = useMemo(
    () =>
      applicableAttempts.find((option) => option.key === selectedAttemptKey)
        ?.label ?? "Not selected",
    [selectedAttemptKey, applicableAttempts],
  );
  const preparationLabel =
    PREPARATION_OPTIONS.find((option) => option.value === preparationState)
      ?.label ?? "Not selected";

  async function saveDraft(nextStep: number) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "draft",
        level: level || null,
        group: effectiveGroup || null,
        attemptKey: selectedAttemptKey || null,
        preparationState: preparationState || null,
        step: nextStep,
      }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      setError(result.error || "Could not save your onboarding progress.");
      return false;
    }
    setStep(nextStep);
    return true;
  }

  async function continueStep() {
    if (step === 1 && !level)
      return setError("Choose your CA level to continue.");
    if (step === 2 && level !== "foundation" && !group)
      return setError("Choose Group 1, Group 2 or Both.");
    if (step === 3 && !selectedAttemptKey)
      return setError("Choose an applicable attempt option.");
    if (selectedAttemptKey !== attemptKey) setAttemptKey(selectedAttemptKey);
    await saveDraft(Math.min(4, step + 1));
  }

  async function complete() {
    if (!isPreparationState(preparationState))
      return setError("Choose your current preparation state.");
    setSaving(true);
    setError(null);
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        level,
        group: effectiveGroup,
        attemptKey: selectedAttemptKey,
        preparationState,
        step: 4,
      }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok)
      return setError(result.error || "Could not complete onboarding.");
    router.push(next);
    router.refresh();
  }

  return (
    <div className="onboarding-v2">
      <header className="onboarding-v2__header">
        <Badge tone="brand">Quick setup</Badge>
        <h1>Set up CA Progress around your attempt.</h1>
        <p>
          Four short choices are enough to open Today. CA Progress will not
          guess progress, strengths or weaknesses during setup.
        </p>
      </header>
      <Card className="onboarding-v2__card">
        <CardBody>
          <div className="onboarding-progress">
            <div>
              <span>Onboarding</span>
              <strong>Step {step} of 4</strong>
            </div>
            <Progress value={step * 25} />
          </div>
          {error ? (
            <div className="auth-status auth-status--danger" role="alert">
              {error}
            </div>
          ) : null}
          <div className="onboarding-v2__body">
            {step === 1 ? (
              <section>
                <span className="onboarding-icon">
                  <Icon name="layers" />
                </span>
                <h2>Choose your CA level</h2>
                <p>
                  This determines the academic catalog and attempt options shown
                  in your workspace.
                </p>
                <div className="auth-choice-grid">
                  {[
                    ["foundation", "Foundation"],
                    ["intermediate", "Intermediate"],
                    ["final", "Final"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={level === value ? "is-selected" : ""}
                      onClick={() => {
                        const nextLevel = value as CALevel;
                        setLevel(nextLevel);
                        const nextAttempts = attempts.filter((option) =>
                          attemptAppliesToLevel(option, nextLevel),
                        );
                        if (
                          !nextAttempts.some(
                            (option) => option.key === attemptKey,
                          )
                        )
                          setAttemptKey("");
                        if (nextLevel === "foundation")
                          setGroup("not_applicable");
                        else if (group === "not_applicable") setGroup("");
                        setError(null);
                      }}
                    >
                      {label}
                      {level === value ? <Icon name="check" size={16} /> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {step === 2 ? (
              <section>
                <span className="onboarding-icon">
                  <Icon name="target" />
                </span>
                <h2>
                  {level === "foundation"
                    ? "Group selection"
                    : "Choose your group"}
                </h2>
                <p>
                  {level === "foundation"
                    ? "Foundation does not use a Group 1 / Group 2 choice, so there is nothing to select here."
                    : "Choose the group you want to study and track."}
                </p>
                {level === "foundation" ? (
                  <div className="onboarding-na">
                    <Icon name="check" />
                    <span>
                      <strong>Not applicable</strong>
                      <small>You can continue to the next step.</small>
                    </span>
                  </div>
                ) : (
                  <div className="auth-choice-grid">
                    {[
                      ["group_1", "Group 1"],
                      ["group_2", "Group 2"],
                      ["both", "Both groups"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={group === value ? "is-selected" : ""}
                        onClick={() => {
                          setGroup(value as GroupChoice);
                          setError(null);
                        }}
                      >
                        {label}
                        {group === value ? (
                          <Icon name="check" size={16} />
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
            {step === 3 ? (
              <section>
                <span className="onboarding-icon">
                  <Icon name="calendar" />
                </span>
                <h2>Choose your attempt</h2>
                <p>
                  Only attempts available for your selected CA level are shown.
                </p>
                <Select
                  label="Attempt"
                  value={selectedAttemptKey}
                  disabled={!prerequisitesReady}
                  onChange={(event) => setAttemptKey(event.target.value)}
                >
                  <option value="">
                    {prerequisitesReady
                      ? "Select attempt"
                      : "Select level and group first"}
                  </option>
                  {applicableAttempts.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </section>
            ) : null}
            {step === 4 ? (
              <section>
                <span className="onboarding-icon">
                  <Icon name="check" />
                </span>
                <h2>Where are you in your preparation?</h2>
                <p>
                  This is saved as context only. Phase 2 does not use it to
                  invent strengths, weaknesses or historical performance.
                </p>
                <div className="auth-choice-grid">
                  {PREPARATION_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={
                        preparationState === option.value ? "is-selected" : ""
                      }
                      onClick={() => {
                        setPreparationState(option.value);
                        setError(null);
                      }}
                    >
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                      </span>
                      {preparationState === option.value ? (
                        <Icon name="check" size={16} />
                      ) : null}
                    </button>
                  ))}
                </div>
                <div className="onboarding-summary">
                  <div>
                    <span>Level</span>
                    <strong>{level || "—"}</strong>
                  </div>
                  <div>
                    <span>Group</span>
                    <strong>{effectiveGroup || "—"}</strong>
                  </div>
                  <div>
                    <span>Attempt</span>
                    <strong>{attemptLabel}</strong>
                  </div>
                  <div>
                    <span>Preparation</span>
                    <strong>{preparationLabel}</strong>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
          <div className="button-row onboarding-actions">
            {step > 1 ? (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < 4 ? (
              <Button isLoading={saving} onClick={continueStep}>
                Continue <Icon name="arrow" size={16} />
              </Button>
            ) : (
              <Button isLoading={saving} onClick={complete}>
                Open Today <Icon name="check" size={16} />
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
