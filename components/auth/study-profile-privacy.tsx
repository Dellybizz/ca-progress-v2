"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Visibility = "private" | "buddies" | "public";
type Settings = {
  publicBio: string;
  profileVisibility: Visibility;
  progressVisibility: Visibility;
  streakVisibility: Visibility;
  showLevel: boolean;
  showAttempt: boolean;
  buddyUserIds: string[];
};

const visibilityOptions = [
  { value: "private", label: "Only me" },
  { value: "buddies", label: "Study buddies" },
  { value: "public", label: "Everyone" },
] as const;

export function StudyProfilePrivacy({ ownerUserId, initialSettings, expanded = false }: { ownerUserId: string; initialSettings: Settings; expanded?: boolean }) {
  const [settings, setSettings] = useState(initialSettings);
  const [buddyId, setBuddyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [buddyBusy, setBuddyBusy] = useState(false);
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);

  const pending = useRef(false);

  async function save() {
    if (pending.current) return;
    pending.current = true;
    try {
    setSaving(true); setStatus(null);
    const response = await fetch("/api/v1/study-profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicBio: settings.publicBio,
        profileVisibility: settings.profileVisibility,
        progressVisibility: settings.progressVisibility,
        streakVisibility: settings.streakVisibility,
        showLevel: settings.showLevel,
        showAttempt: settings.showAttempt,
      }),
    });
    const result = await response.json() as { ok?: boolean; error?: string; settings?: Settings };
    if (!response.ok || !result.ok || !result.settings) return setStatus({ error: result.error || "Could not save Study Profile privacy." });
    setSettings(result.settings);
    setStatus({ success: "Privacy saved." });
    } catch {
      setStatus({error:"Could not save privacy. Try again."});
    } finally { pending.current = false; setSaving(false); }
  }

  async function changeBuddy(method: "POST" | "DELETE", id: string) {
    if (pending.current) return;
    pending.current = true;
    try {
    setBuddyBusy(true); setStatus(null);
    const response = await fetch("/api/v1/study-profile/buddies", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buddyUserId: id }),
    });
    const result = await response.json() as { ok?: boolean; error?: string; settings?: Settings };
    if (!response.ok || !result.ok || !result.settings) return setStatus({ error: result.error || "Could not update study buddies." });
    setSettings(result.settings);
    if (method === "POST") setBuddyId("");
    setStatus({ success: method === "POST" ? "Study buddy allowed." : "Study buddy access removed." });
    } catch {
      setStatus({error:"Could not update buddies. Try again."});
    } finally { pending.current = false; setBuddyBusy(false); }
  }

  return <section className="profile-v3-privacy">
    <details open={expanded}>
      <summary><span>Privacy & sharing</span><Icon name="chevron" size={18}/></summary>
      <div className="profile-v3-privacy__body">
        <fieldset className="profile-form-stack" disabled={saving || buddyBusy}>
          <legend className="sr-only">Study profile privacy</legend>
          {status?.error ? <div className="auth-status auth-status--danger" role="alert">{status.error}</div> : null}
          {status?.success ? <div className="auth-status auth-status--success" role="status">{status.success}</div> : null}
          <label className="ui-field">
            <span className="ui-field__label">Public bio</span>
            <textarea className="ui-field__control" rows={3} maxLength={240} value={settings.publicBio} onChange={(event) => setSettings((current) => ({ ...current, publicBio: event.target.value }))} placeholder="A short study-focused introduction"/>
            <small>{settings.publicBio.length}/240 characters</small>
          </label>
          <Select label="Profile visibility" value={settings.profileVisibility} onChange={(event) => setSettings((current) => ({ ...current, profileVisibility: event.target.value as Visibility }))}>
            {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select label="Progress visibility" value={settings.progressVisibility} onChange={(event) => setSettings((current) => ({ ...current, progressVisibility: event.target.value as Visibility }))}>
            {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select label="Streak visibility" value={settings.streakVisibility} onChange={(event) => setSettings((current) => ({ ...current, streakVisibility: event.target.value as Visibility }))}>
            {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <label className="profile-v3-check"><input type="checkbox" checked={settings.showLevel} onChange={(event) => setSettings((current) => ({ ...current, showLevel: event.target.checked }))}/> Show CA level</label>
          <label className="profile-v3-check"><input type="checkbox" checked={settings.showAttempt} onChange={(event) => setSettings((current) => ({ ...current, showAttempt: event.target.checked }))}/> Show target attempt</label>
          <Button size="lg" isLoading={saving} onClick={save}>Save privacy</Button>
          <div className="profile-v3-privacy__links"><a href={`/study-profile/${encodeURIComponent(ownerUserId)}`}>View study profile</a><small>Scores, notes and files stay private.</small></div>
          <details className="profile-v3-buddies">
            <summary><span>Study buddies ({settings.buddyUserIds.length})</span><Icon name="chevron" size={16}/></summary>
            <div className="profile-form-stack">
          <Input label="Buddy user ID" value={buddyId} maxLength={128} onChange={(event) => setBuddyId(event.target.value)} placeholder="Exact user ID" hint="Accept their Study Buddy request first."/>
          <Button variant="secondary" disabled={buddyBusy || !buddyId.trim()} onClick={() => changeBuddy("POST", buddyId.trim())}>Add buddy</Button>
          {settings.buddyUserIds.length ? <div>
            <strong>Allowed buddies</strong>
            <div className="profile-form-stack" style={{ marginTop: 8 }}>
              {settings.buddyUserIds.map((id) => <div key={id} className="profile-v3-buddy"><code>{id}</code><Button variant="ghost" disabled={buddyBusy} onClick={() => changeBuddy("DELETE", id)}>Remove</Button></div>)}
            </div>
          </div> : <small>No buddy access granted.</small>}
            </div>
          </details>
        </fieldset>
      </div>
    </details>
  </section>;
}
