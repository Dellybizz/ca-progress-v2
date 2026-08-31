"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { normalizePrimaryUsePriority, primaryUseOptions, type PrimaryUse } from "@/lib/profile/onboarding";
import { attemptAppliesToLevel, type AttemptOption, type CALevel, type GroupChoice } from "@/lib/profile/validation";

type InitialProfile = {
  ca_level: string | null;
  group_choice: string | null;
  attempt_key: string | null;
  daily_target_minutes: number | null;
  onboarding_step: number;
  primary_use: PrimaryUse | null;
  primary_use_priority: PrimaryUse[] | null;
};

type DraftValues = {
  level: CALevel | "";
  group: GroupChoice | "";
  attemptKey: string;
  primaryUse: PrimaryUse | "";
  primaryUsePriority: PrimaryUse[];
  dailyTargetMinutes: number;
};

const primaryUseIcons: Record<PrimaryUse, IconName> = {
  plan: "sparkles",
  progress: "chart",
  focus: "timer",
  updates: "bell",
  tests: "tests",
  community: "community",
};

export function OnboardingWizard({ initialProfile, attempts, next }: { initialProfile: InitialProfile; attempts: AttemptOption[]; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(5, Math.max(1, initialProfile.onboarding_step || 1)));
  const [level, setLevel] = useState<CALevel | "">((initialProfile.ca_level as CALevel | null) ?? "");
  const [group, setGroup] = useState<GroupChoice | "">((initialProfile.group_choice as GroupChoice | null) ?? "");
  const [attemptKey, setAttemptKey] = useState(initialProfile.attempt_key ?? "");
  const [primaryUsePriority, setPrimaryUsePriority] = useState<PrimaryUse[]>(normalizePrimaryUsePriority(initialProfile.primary_use_priority, initialProfile.primary_use));
  const [target, setTarget] = useState(String(initialProfile.daily_target_minutes ?? 120));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveGroup = level === "foundation" ? "not_applicable" : group;
  const applicableAttempts = useMemo(() => level ? attempts.filter((option) => attemptAppliesToLevel(option, level)) : attempts, [attempts, level]);
  const selectedAttemptKey = applicableAttempts.some((option) => option.key === attemptKey) ? attemptKey : applicableAttempts[0]?.key ?? "";
  const attemptLabel = useMemo(() => applicableAttempts.find((option) => option.key === selectedAttemptKey)?.label ?? "Not selected", [selectedAttemptKey, applicableAttempts]);
  const priorityLabels = primaryUsePriority.map((key) => primaryUseOptions.find((option) => option.key === key)?.label ?? key);
  const changeAccountHref = `/logout?next=${encodeURIComponent(`/onboarding?next=${encodeURIComponent(next)}`)}`;

  function currentValues(overrides: Partial<DraftValues> = {}): DraftValues {
    return {
      level,
      group: effectiveGroup,
      attemptKey: selectedAttemptKey,
      primaryUse: primaryUsePriority[0] ?? "",
      primaryUsePriority,
      dailyTargetMinutes: Number(target || 120),
      ...overrides,
    };
  }

  async function saveDraft(nextStep: number, values: DraftValues, advance = true) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "draft", ...values, step: nextStep }),
    });
    const result = await response.json() as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      setError(result.error || "Could not save your onboarding progress.");
      return false;
    }
    if (advance) setStep(nextStep);
    return true;
  }

  async function chooseLevel(nextLevel: CALevel) {
    if (saving) return;
    const nextAttempts = attempts.filter((option) => attemptAppliesToLevel(option, nextLevel));
    const nextAttempt = nextAttempts.some((option) => option.key === attemptKey) ? attemptKey : nextAttempts[0]?.key ?? "";
    const nextGroup: GroupChoice | "" = nextLevel === "foundation" ? "not_applicable" : group === "not_applicable" ? "" : group;
    setLevel(nextLevel);
    setGroup(nextGroup);
    setAttemptKey(nextAttempt);
    await saveDraft(2, currentValues({ level: nextLevel, group: nextGroup, attemptKey: nextAttempt }));
  }

  async function chooseGroup(nextGroup: GroupChoice) {
    if (saving) return;
    setGroup(nextGroup);
    await saveDraft(3, currentValues({ group: nextGroup }));
  }

  async function chooseAttempt(nextAttempt: string) {
    if (saving) return;
    setAttemptKey(nextAttempt);
    await saveDraft(4, currentValues({ attemptKey: nextAttempt }));
  }

  async function togglePrimaryUse(nextUse: PrimaryUse) {
    if (saving) return;
    const nextPriority = primaryUsePriority.includes(nextUse)
      ? primaryUsePriority.filter((key) => key !== nextUse)
      : [...primaryUsePriority, nextUse];
    setPrimaryUsePriority(nextPriority);
    await saveDraft(4, currentValues({ primaryUse: nextPriority[0] ?? "", primaryUsePriority: nextPriority }), false);
  }

  async function continueFromPriorities() {
    if (!primaryUsePriority.length) return setError("Choose at least one priority to continue.");
    await saveDraft(5, currentValues());
  }

  async function complete() {
    if (!level) return setError("Choose your CA level first.");
    if (level !== "foundation" && !effectiveGroup) return setError("Choose your group first.");
    if (!selectedAttemptKey) return setError("Choose your attempt first.");
    if (!primaryUsePriority.length) return setError("Choose at least one priority for CA Progress.");
    setSaving(true);
    setError(null);
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", level, group: effectiveGroup, attemptKey: selectedAttemptKey, primaryUse: primaryUsePriority[0], primaryUsePriority, dailyTargetMinutes: Number(target), step: 5 }),
    });
    const result = await response.json() as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) return setError(result.error || "Could not complete onboarding.");
    router.push(`/onboarding/guide?next=${encodeURIComponent(next)}`);
    router.refresh();
  }

  return <div className="onboarding-v2">
    <header className="onboarding-v2__header">
      <Badge tone="brand">First-run setup</Badge>
      <h1>Set up the workspace around your attempt.</h1>
      <p>Your choices are saved as you make them, so you can leave and continue later.</p>
    </header>
    <Card className="onboarding-v2__card"><CardBody>
      <div className="onboarding-progress"><div><span>Onboarding</span><strong>Step {step} of 5</strong></div><Progress value={step * 20}/></div>
      {error ? <div className="auth-status auth-status--danger" role="alert">{error}</div> : null}
      <div className="onboarding-v2__body">
        {step === 1 ? <section>
          <span className="onboarding-icon"><Icon name="layers"/></span>
          <h2>Choose your CA level</h2>
          <p>This sets the subjects and exam attempts that belong in your workspace.</p>
          <div className="auth-choice-grid">{[["foundation","Foundation"],["intermediate","Intermediate"],["final","Final"]].map(([value,label]) => <button type="button" disabled={saving} key={value} className={level === value ? "is-selected" : ""} onClick={() => chooseLevel(value as CALevel)}>{label}{level === value ? <Icon name="check" size={16}/> : null}</button>)}</div>
        </section> : null}

        {step === 2 ? <section>
          <span className="onboarding-icon"><Icon name="target"/></span>
          <h2>{level === "foundation" ? "Group selection" : "Choose your group"}</h2>
          <p>{level === "foundation" ? "Foundation does not use Group 1 / Group 2, so we will move past this step automatically." : "Choose the group you want to study and track."}</p>
          {level === "foundation" ? <button type="button" className="onboarding-na onboarding-na--button" disabled={saving} onClick={() => chooseGroup("not_applicable")}><Icon name="check"/><span><strong>Continue with Foundation</strong><small>No group selection needed</small></span></button> : <div className="auth-choice-grid">{[["group_1","Group 1"],["group_2","Group 2"],["both","Both groups"]].map(([value,label]) => <button type="button" disabled={saving} key={value} className={group === value ? "is-selected" : ""} onClick={() => chooseGroup(value as GroupChoice)}>{label}{group === value ? <Icon name="check" size={16}/> : null}</button>)}</div>}
        </section> : null}

        {step === 3 ? <section>
          <span className="onboarding-icon"><Icon name="calendar"/></span>
          <h2>Choose your attempt</h2>
          <p>Choose the exam attempt you are currently preparing for.</p>
          <div className="attempt-choice-grid">{applicableAttempts.map((option) => <button type="button" disabled={saving} key={option.key} className={selectedAttemptKey === option.key ? "is-selected" : ""} onClick={() => chooseAttempt(option.key)}><span><strong>{option.label}</strong><small>Your selected CA level</small></span>{selectedAttemptKey === option.key ? <Icon name="check" size={17}/> : <Icon name="arrow" size={16}/>}</button>)}</div>
        </section> : null}

        {step === 4 ? <section>
          <span className="onboarding-icon"><Icon name="sparkles"/></span>
          <h2>What will you use CA Progress most for?</h2>
          <p>Select one or more in priority order. Your first choice is Priority 1, your next choice is Priority 2, and so on.</p>
          <div className="primary-use-grid">{primaryUseOptions.map((option) => { const priority = primaryUsePriority.indexOf(option.key) + 1; return <button type="button" disabled={saving} key={option.key} className={priority ? "is-selected" : ""} onClick={() => togglePrimaryUse(option.key)}><span className="primary-use-grid__icon"><Icon name={primaryUseIcons[option.key]} size={19}/></span><span><strong>{option.label}</strong><small>{option.description}</small></span>{priority ? <span className="primary-use-grid__rank" aria-label={`Priority ${priority}`}>{priority}</span> : null}</button>; })}</div>
          <div className="priority-selection-summary" aria-live="polite">{primaryUsePriority.length ? `${primaryUsePriority.length} ${primaryUsePriority.length === 1 ? "priority" : "priorities"} selected. Tap a selected card to remove it.` : "Choose at least one. You can rank all six if you want."}</div>
        </section> : null}

        {step === 5 ? <section>
          <span className="onboarding-icon"><Icon name="clock"/></span>
          <h2>Set a daily target and confirm</h2>
          <p>Choose a realistic daily focus target. You can change it later from Profile settings.</p>
          <Input label="Daily target (minutes)" type="number" inputMode="numeric" min={15} max={720} step={15} value={target} onChange={(event) => setTarget(event.target.value)}/>
          <div className="onboarding-summary"><div><span>Level</span><strong>{level || "—"}</strong></div><div><span>Group</span><strong>{effectiveGroup || "—"}</strong></div><div><span>Attempt</span><strong>{attemptLabel}</strong></div><div><span>Priorities</span><strong>{priorityLabels.length ? priorityLabels.join(" → ") : "—"}</strong></div><div><span>Daily target</span><strong>{target || "—"} min</strong></div></div>
        </section> : null}
      </div>
      <div className="button-row onboarding-actions">
        {step === 1 ? <Link className="ui-button ui-button--secondary ui-button--md" href={changeAccountHref}>Change account</Link> : <Button variant="secondary" disabled={saving} onClick={() => setStep(step - 1)}>Back</Button>}
        {step === 4 ? <Button disabled={saving || !primaryUsePriority.length} isLoading={saving} onClick={continueFromPriorities}>Continue <Icon name="arrow" size={16}/></Button> : step === 5 ? <Button isLoading={saving} onClick={complete}>Finish setup <Icon name="check" size={16}/></Button> : <span className="onboarding-autosave">{saving ? "Saving your choice…" : "Choose an option to continue"}</span>}
      </div>
    </CardBody></Card>
  </div>;
}
