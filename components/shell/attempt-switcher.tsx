"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttemptOption } from "@/lib/profile/validation";
import type { StudentContextContract } from "@/lib/academic/student-context";
import { Icon } from "@/components/ui/icon";

export function AttemptSwitcher({ context, attempts, compact = false }: { context: StudentContextContract; attempts: AttemptOption[]; compact?: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const available = useMemo(() => context.selection ? attempts.filter(attempt => attempt.key !== "undecided" && attempt.levels?.includes(context.selection!.level) && (attempt.groupsByLevel?.[context.selection!.level] ?? []).includes(context.selection!.group)) : [], [attempts, context.selection]);
  if (context.mode !== "ready" || !context.selection || available.length < 2) return null;
  const current = available.find(attempt => attempt.key === context.selection?.attemptKey);
  async function change(attemptKey: string) {
    if (!context.selection || attemptKey === context.selection.attemptKey) return;
    setSaving(true); setError("");
    const response = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: context.displayName, level: context.selection.level, group: context.selection.group, attemptKey, dailyTargetMinutes: context.dailyTargetMinutes }) });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) { setError(result?.error ?? "Could not change attempt."); setSaving(false); return; }
    router.refresh(); setSaving(false);
  }
  return <div className={`attempt-switcher${compact ? " attempt-switcher--compact" : ""}`}>
    <label htmlFor={compact ? "mobile-attempt" : "desktop-attempt"}><span>Exam attempt</span><strong>{current?.label ?? context.selection.attemptKey}</strong></label>
    <span className="attempt-switcher__control"><select id={compact ? "mobile-attempt" : "desktop-attempt"} value={context.selection.attemptKey} disabled={saving} onChange={event => void change(event.target.value)} aria-describedby={error ? "attempt-error" : undefined}>{available.map(attempt => <option key={attempt.key} value={attempt.key}>{attempt.label}</option>)}</select><Icon name="chevron" size={13}/></span>
    {error ? <small id="attempt-error" role="alert">{error}</small> : null}
  </div>;
}
