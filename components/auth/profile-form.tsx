"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { attemptAppliesToLevel, type AttemptOption, type CALevel, type GroupChoice } from "@/lib/profile/validation";

type Profile = { display_name: string | null; avatar_url: string | null; ca_level: string | null; group_choice: string | null; attempt_key: string | null; daily_target_minutes: number | null };

export function ProfileForm({ profile, attempts, avatarSignedUrl, identityLabel }: { profile: Profile; attempts: AttemptOption[]; avatarSignedUrl: string | null; identityLabel: string }) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name ?? "");
  const [level, setLevel] = useState<CALevel | "">((profile.ca_level as CALevel | null) ?? "");
  const [group, setGroup] = useState<GroupChoice | "">((profile.group_choice as GroupChoice | null) ?? "");
  const [attemptKey, setAttemptKey] = useState(profile.attempt_key ?? "");
  const [target, setTarget] = useState(String(profile.daily_target_minutes ?? 120));
  const [avatarUrl, setAvatarUrl] = useState(avatarSignedUrl);
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const effectiveGroup = level === "foundation" ? "not_applicable" : group;
  const applicableAttempts = useMemo(() => level ? attempts.filter((option) => attemptAppliesToLevel(option, level)) : attempts, [attempts, level]);
  const selectedAttemptKey = applicableAttempts.some((option) => option.key === attemptKey) ? attemptKey : applicableAttempts[0]?.key ?? "";

  async function saveProfile() {
    setSaving(true); setStatus(null);
    const response = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, level, group: effectiveGroup, attemptKey: selectedAttemptKey, dailyTargetMinutes: Number(target) }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) return setStatus({ error: result.error || "Could not save profile." });
    if (selectedAttemptKey !== attemptKey) setAttemptKey(selectedAttemptKey);
    setStatus({ success: "Profile saved." }); router.refresh();
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true); setStatus(null);
    const data = new FormData(); data.set("avatar", file);
    const response = await fetch("/api/profile/avatar", { method: "POST", body: data });
    const result = await response.json() as { ok?: boolean; error?: string; signedUrl?: string };
    setUploading(false);
    if (!response.ok || !result.ok) return setStatus({ error: result.error || "Could not upload avatar." });
    setAvatarUrl(result.signedUrl ?? null); setStatus({ success: "Avatar updated." }); router.refresh();
  }

  const initial = (name || identityLabel || "S").trim().charAt(0).toUpperCase();
  return <div className="profile-v2"><div className="profile-v2__hero"><div className="profile-avatar-large" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}>{avatarUrl ? <span className="sr-only">Profile avatar</span> : initial}</div><div><Badge tone="brand">Private profile</Badge><h1>Your CA Progress profile</h1><p>Your profile information and study preferences are private to your account.</p></div></div>{status?.error ? <div className="auth-status auth-status--danger" role="alert">{status.error}</div> : null}{status?.success ? <div className="auth-status auth-status--success" role="status">{status.success}</div> : null}<div className="profile-v2__grid"><Card><CardHeader title="Identity" description={identityLabel}/><CardBody><div className="profile-form-stack"><Input label="Display name" value={name} maxLength={80} autoComplete="name" onChange={(event) => setName(event.target.value)}/><label className="avatar-upload"><span className="ui-field__label">Avatar</span><span className="avatar-upload__control"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => uploadAvatar(event.target.files?.[0])}/><span><Icon name="plus" size={16}/>{uploading ? "Uploading…" : "Choose image"}</span></span><small>JPEG, PNG or WebP · maximum 2 MB · stored privately.</small></label></div></CardBody></Card><Card><CardHeader title="Study profile" description="Your course, group and exam attempt"/><CardBody><div className="profile-form-stack"><Select label="CA level" value={level} onChange={(event) => { const nextLevel = event.target.value as CALevel; setLevel(nextLevel); const nextAttempts = attempts.filter((option) => attemptAppliesToLevel(option, nextLevel)); if (!nextAttempts.some((option) => option.key === attemptKey)) setAttemptKey(nextAttempts[0]?.key ?? ""); if (nextLevel === "foundation") setGroup("not_applicable"); else if (group === "not_applicable") setGroup(""); }}><option value="">Select level</option><option value="foundation">Foundation</option><option value="intermediate">Intermediate</option><option value="final">Final</option></Select>{level !== "foundation" ? <Select label="Group" value={group} onChange={(event) => setGroup(event.target.value as GroupChoice)}><option value="">Select group</option><option value="group_1">Group 1</option><option value="group_2">Group 2</option><option value="both">Both groups</option></Select> : <div className="onboarding-na"><Icon name="check"/><span><strong>Group: not applicable</strong><small>Foundation profile</small></span></div>}<Select label="Attempt" value={selectedAttemptKey} onChange={(event) => setAttemptKey(event.target.value)}>{applicableAttempts.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</Select><Input label="Daily target (minutes)" type="number" min={15} max={720} step={15} value={target} onChange={(event) => setTarget(event.target.value)}/><Button size="lg" isLoading={saving} onClick={saveProfile}>Save profile</Button></div></CardBody></Card></div><form action="/auth/signout" method="post" className="profile-signout"><Button variant="ghost" type="submit">Sign out on this device</Button></form></div>;
}
