"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import type { AttemptOption, CALevel, GroupChoice } from "@/lib/profile/validation";

type InitialProfile = { ca_level: string | null; group_choice: string | null; attempt_key: string | null; daily_target_minutes: number | null; onboarding_step: number };

export function OnboardingWizard({ initialProfile, attempts, next }: { initialProfile: InitialProfile; attempts: AttemptOption[]; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(4, Math.max(1, initialProfile.onboarding_step || 1)));
  const [level, setLevel] = useState<CALevel | "">((initialProfile.ca_level as CALevel | null) ?? "");
  const [group, setGroup] = useState<GroupChoice | "">((initialProfile.group_choice as GroupChoice | null) ?? "");
  const [attemptKey, setAttemptKey] = useState(initialProfile.attempt_key ?? attempts[0]?.key ?? "");
  const [target, setTarget] = useState(String(initialProfile.daily_target_minutes ?? 120));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const effectiveGroup = level === "foundation" ? "not_applicable" : group;
  const attemptLabel = useMemo(() => attempts.find((option) => option.key === attemptKey)?.label ?? "Not selected", [attemptKey, attempts]);

  async function saveDraft(nextStep: number) {
    setSaving(true); setError(null);
    const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", level: level || null, group: effectiveGroup || null, attemptKey: attemptKey || null, dailyTargetMinutes: target ? Number(target) : null, step: nextStep }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) { setError(result.error || "Could not save your onboarding progress."); return false; }
    setStep(nextStep); return true;
  }

  async function continueStep() {
    if (step === 1 && !level) return setError("Choose your CA level to continue.");
    if (step === 2 && level !== "foundation" && !group) return setError("Choose Group 1, Group 2 or Both.");
    if (step === 3 && !attemptKey) return setError("Choose an attempt option.");
    await saveDraft(Math.min(4, step + 1));
  }

  async function complete() {
    setSaving(true); setError(null);
    const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", level, group: effectiveGroup, attemptKey, dailyTargetMinutes: Number(target), step: 4 }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) return setError(result.error || "Could not complete onboarding.");
    router.push(next); router.refresh();
  }

  return <div className="onboarding-v2"><header className="onboarding-v2__header"><Badge tone="brand">First-run setup</Badge><h1>Set up the workspace around your attempt.</h1><p>Your selections are saved to your private profile as you continue, so an interrupted setup resumes instead of restarting.</p></header><Card className="onboarding-v2__card"><CardBody><div className="onboarding-progress"><div><span>Onboarding</span><strong>Step {step} of 4</strong></div><Progress value={step * 25}/></div>{error ? <div className="auth-status auth-status--danger" role="alert">{error}</div> : null}<div className="onboarding-v2__body">{step === 1 ? <section><span className="onboarding-icon"><Icon name="layers"/></span><h2>Choose your CA level</h2><p>This determines the academic workspace that later syllabus phases will populate.</p><div className="auth-choice-grid">{[["foundation","Foundation"],["intermediate","Intermediate"],["final","Final"]].map(([value,label]) => <button type="button" key={value} className={level === value ? "is-selected" : ""} onClick={() => { const nextLevel = value as CALevel; setLevel(nextLevel); if (nextLevel === "foundation") setGroup("not_applicable"); else if (group === "not_applicable") setGroup(""); setError(null); }}>{label}{level === value ? <Icon name="check" size={16}/> : null}</button>)}</div></section> : null}{step === 2 ? <section><span className="onboarding-icon"><Icon name="target"/></span><h2>{level === "foundation" ? "Group selection" : "Choose your group"}</h2><p>{level === "foundation" ? "Foundation does not use a Group 1 / Group 2 choice here, so this step is marked not applicable." : "Choose the group scope you want the V2 workspace to show."}</p>{level === "foundation" ? <div className="onboarding-na"><Icon name="check"/><span><strong>Not applicable</strong><small>Saved explicitly so the profile is complete and unambiguous.</small></span></div> : <div className="auth-choice-grid">{[["group_1","Group 1"],["group_2","Group 2"],["both","Both groups"]].map(([value,label]) => <button type="button" key={value} className={group === value ? "is-selected" : ""} onClick={() => { setGroup(value as GroupChoice); setError(null); }}>{label}{group === value ? <Icon name="check" size={16}/> : null}</button>)}</div>}</section> : null}{step === 3 ? <section><span className="onboarding-icon"><Icon name="calendar"/></span><h2>Choose your attempt</h2><p>The selector is loaded from the V2 database. Phase 2 deliberately does not invent ICAI dates; verified academic attempts are introduced by the academic data phase.</p><Select label="Attempt" value={attemptKey} onChange={(event) => setAttemptKey(event.target.value)}>{attempts.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</Select></section> : null}{step === 4 ? <section><span className="onboarding-icon"><Icon name="clock"/></span><h2>Set a daily target and confirm</h2><p>Choose a realistic daily focus target. You can change it later from Profile settings.</p><Input label="Daily target (minutes)" type="number" inputMode="numeric" min={15} max={720} step={15} value={target} onChange={(event) => setTarget(event.target.value)}/><div className="onboarding-summary"><div><span>Level</span><strong>{level || "—"}</strong></div><div><span>Group</span><strong>{effectiveGroup || "—"}</strong></div><div><span>Attempt</span><strong>{attemptLabel}</strong></div><div><span>Daily target</span><strong>{target || "—"} min</strong></div></div></section> : null}</div><div className="button-row onboarding-actions">{step > 1 ? <Button variant="secondary" disabled={saving} onClick={() => setStep(step - 1)}>Back</Button> : <span/>}{step < 4 ? <Button isLoading={saving} onClick={continueStep}>Save & continue <Icon name="arrow" size={16}/></Button> : <Button isLoading={saving} onClick={complete}>Finish setup <Icon name="check" size={16}/></Button>}</div></CardBody></Card></div>;
}
