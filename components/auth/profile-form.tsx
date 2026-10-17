"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  attemptAppliesToSelection,
  type AttemptOption,
  type CALevel,
  type GroupChoice,
} from "@/lib/profile/validation";

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  ca_level: string | null;
  group_choice: string | null;
  attempt_key: string | null;
  daily_target_minutes: number | null;
};

export function ProfileForm({
  profile,
  attempts,
  avatarSignedUrl,
  identityLabel,
}: {
  profile: Profile;
  attempts: AttemptOption[];
  avatarSignedUrl: string | null;
  identityLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name ?? "");
  const [level, setLevel] = useState<CALevel | "">(
    (profile.ca_level as CALevel | null) ?? "",
  );
  const [group, setGroup] = useState<GroupChoice | "">(
    (profile.group_choice as GroupChoice | null) ?? "",
  );
  const [attemptKey, setAttemptKey] = useState(profile.attempt_key ?? "");
  const [target, setTarget] = useState(
    String(profile.daily_target_minutes ?? 120),
  );
  const [avatarUrl, setAvatarUrl] = useState(avatarSignedUrl);
  const [status, setStatus] = useState<{
    error?: string;
    success?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pending = useRef(false);
  const effectiveGroup = level === "foundation" ? "not_applicable" : group;
  const prerequisitesReady = Boolean(
    level && (level === "foundation" || group),
  );
  const applicableAttempts = useMemo(
    () =>
      prerequisitesReady && level
        ? attempts.filter((option) =>
            attemptAppliesToSelection(option, level, effectiveGroup),
          )
        : [],
    [attempts, effectiveGroup, level, prerequisitesReady],
  );
  const selectedAttemptKey = applicableAttempts.some(
    (option) => option.key === attemptKey,
  )
    ? attemptKey
    : "";

  async function saveProfile() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/v1/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({displayName:name, level, group:effectiveGroup, attemptKey:selectedAttemptKey, dailyTargetMinutes:Number(target)}),
      });
      const result = await response.json() as {ok?:boolean;error?:string};
      if (!response.ok || !result.ok) {setStatus({error:result.error || "Could not save profile."});return;}
      if (selectedAttemptKey !== attemptKey) setAttemptKey(selectedAttemptKey);
      setStatus({success:"Profile saved."});
      router.refresh();
    } catch {
      setStatus({error:"Could not save. Check your connection and try again."});
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file || pending.current) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024) {
      setStatus({error:"Choose a JPG, PNG or WebP image up to 2 MB."});
      return;
    }
    pending.current = true;
    setUploading(true);
    setStatus(null);
    try {
      const data = new FormData();
      data.set("avatar", file);
      const response = await fetch("/api/v1/profile/avatar", {method:"POST",body:data});
      const result = await response.json() as {ok?:boolean;error?:string;signedUrl?:string};
      if (!response.ok || !result.ok) {setStatus({error:result.error || "Could not upload photo."});return;}
      setAvatarUrl(result.signedUrl ?? null);
      setStatus({success:"Photo updated."});
      router.refresh();
    } catch {
      setStatus({error:"Could not upload. Check your connection and try again."});
    } finally {
      pending.current = false;
      setUploading(false);
    }
  }

  const initial = (name || identityLabel || "S").trim().charAt(0).toUpperCase();
  return (
    <section className="profile-v3">
      <header className="profile-v3__heading"><h1>Profile</h1><a href="/settings">Account settings</a></header>
      <form onSubmit={event => {event.preventDefault();void saveProfile();}}>
        <fieldset className="profile-v3__grid" disabled={saving || uploading}>
          <legend className="sr-only">Edit your profile</legend>
          <Card>
            <CardHeader title="Personal details"/>
            <CardBody>
              <div className="profile-v3__identity">
                <div className="profile-v3__avatar" style={avatarUrl?{backgroundImage:`url(${avatarUrl})`}:undefined}>
                  {avatarUrl?<span className="sr-only">Profile photo</span>:initial}
                </div>
                <div className="profile-v3__photo">
                  <p>{identityLabel}</p>
                  <label className="avatar-upload">
                    <span className="avatar-upload__control">
                      <input aria-label="Change profile photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{void uploadAvatar(event.target.files?.[0]);event.target.value='';}}/>
                      <span>{uploading?'Uploading…':'Change photo'}</span>
                    </span>
                    <small>JPG, PNG or WebP · 2 MB max</small>
                  </label>
                </div>
              </div>
              <Input label="Display name" name="displayName" value={name} maxLength={80} required autoComplete="name" onChange={event=>setName(event.target.value)}/>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Study preferences"/>
            <CardBody>
              <div className="profile-v3__study">
              <Select
                label="CA level"
                required
                value={level}
                onChange={(event) => {
                  const nextLevel = event.target.value as CALevel;
                  setLevel(nextLevel);
                  const nextGroup =
                    nextLevel === "foundation"
                      ? "not_applicable"
                      : group === "not_applicable"
                        ? ""
                        : group;
                  const nextAttempts = attempts.filter((option) =>
                    attemptAppliesToSelection(option, nextLevel, nextGroup),
                  );
                  if (!nextAttempts.some((option) => option.key === attemptKey))
                    setAttemptKey("");
                  if (nextLevel === "foundation") setGroup("not_applicable");
                  else if (group === "not_applicable") setGroup("");
                }}
              >
                <option value="">Select level</option>
                <option value="foundation">Foundation</option>
                <option value="intermediate">Intermediate</option>
                <option value="final">Final</option>
              </Select>
              {level !== "foundation" ? (
                <Select
                  label="Group"
                  required
                  value={group}
                  onChange={(event) => {
                    const nextGroup = event.target.value as GroupChoice;
                    setGroup(nextGroup);
                    const nextAttempts = level
                      ? attempts.filter((option) =>
                          attemptAppliesToSelection(option, level, nextGroup),
                        )
                      : attempts;
                    if (
                      !nextAttempts.some((option) => option.key === attemptKey)
                    )
                      setAttemptKey("");
                  }}
                >
                  <option value="">Select group</option>
                  <option value="group_1">Group 1</option>
                  <option value="group_2">Group 2</option>
                  <option value="both">Both groups</option>
                </Select>
              ) : (
                <div className="profile-v3__foundation"><span>Group</span><strong>Not applicable</strong></div>
              )}
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
              <Input
                label="Daily target (minutes)"
                type="number"
                min={15}
                max={720}
                step={1}
                required
                inputMode="numeric"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
              </div>
            </CardBody>
          </Card>
        </fieldset>
        <div className="profile-v3__actions">
          <div aria-live="polite">
            {status?.error?<p className="auth-status auth-status--danger" role="alert">{status.error}</p>:null}
            {status?.success?<p className="auth-status auth-status--success" role="status">{status.success}</p>:null}
          </div>
          <Button type="submit" isLoading={saving} disabled={uploading}>Save changes</Button>
        </div>
      </form>
    </section>
  );
}
