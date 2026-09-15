"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
  { value: "private", label: "Private — only me" },
  { value: "buddies", label: "Study buddies — people I explicitly allow" },
  { value: "public", label: "Public — anyone with my profile link" },
] as const;

export function StudyProfilePrivacy({ ownerUserId, initialSettings }: { ownerUserId: string; initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [buddyId, setBuddyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [buddyBusy, setBuddyBusy] = useState(false);
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);

  async function save() {
    setSaving(true); setStatus(null);
    const response = await fetch("/api/study-profile", {
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
    setSaving(false);
    if (!response.ok || !result.ok || !result.settings) return setStatus({ error: result.error || "Could not save Study Profile privacy." });
    setSettings(result.settings);
    setStatus({ success: "Study Profile privacy saved." });
  }

  async function changeBuddy(method: "POST" | "DELETE", id: string) {
    setBuddyBusy(true); setStatus(null);
    const response = await fetch("/api/study-profile/buddies", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buddyUserId: id }),
    });
    const result = await response.json() as { ok?: boolean; error?: string; settings?: Settings };
    setBuddyBusy(false);
    if (!response.ok || !result.ok || !result.settings) return setStatus({ error: result.error || "Could not update study buddies." });
    setSettings(result.settings);
    if (method === "POST") setBuddyId("");
    setStatus({ success: method === "POST" ? "Study buddy allowed." : "Study buddy access removed." });
  }

  return <div style={{ marginTop: 24 }}>
    <Card>
      <CardHeader title="Study Profile privacy" description="Private by default. Every outward-facing academic field is checked again on the server."/>
      <CardBody>
        <div className="profile-form-stack">
          {status?.error ? <div className="auth-status auth-status--danger" role="alert">{status.error}</div> : null}
          {status?.success ? <div className="auth-status auth-status--success" role="status">{status.success}</div> : null}
          <label className="ui-field">
            <span className="ui-field__label">Public bio</span>
            <textarea className="ui-field__control" rows={4} maxLength={240} value={settings.publicBio} onChange={(event) => setSettings((current) => ({ ...current, publicBio: event.target.value }))} placeholder="A short study-focused introduction"/>
            <small>{settings.publicBio.length}/240 characters</small>
          </label>
          <Select label="Profile visibility" value={settings.profileVisibility} onChange={(event) => setSettings((current) => ({ ...current, profileVisibility: event.target.value as Visibility }))}>
            {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select label="Progress visibility" value={settings.progressVisibility} onChange={(event) => setSettings((current) => ({ ...current, progressVisibility: event.target.value as Visibility }))}>
            {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select label="Streak & consistency visibility" value={settings.streakVisibility} onChange={(event) => setSettings((current) => ({ ...current, streakVisibility: event.target.value as Visibility }))}>
            {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <label><input type="checkbox" checked={settings.showLevel} onChange={(event) => setSettings((current) => ({ ...current, showLevel: event.target.checked }))}/> Show my CA level when my Study Profile is visible</label>
          <label><input type="checkbox" checked={settings.showAttempt} onChange={(event) => setSettings((current) => ({ ...current, showAttempt: event.target.checked }))}/> Show my target attempt when my Study Profile is visible</label>
          <Button size="lg" isLoading={saving} onClick={save}>Save Study Profile privacy</Button>
          <small>Direct profile path: /study-profile/{ownerUserId}. Changing a field to public never exposes test scores, answer sheets, notes, or private reflections.</small>
        </div>
      </CardBody>
    </Card>

    <Card style={{ marginTop: 16 }}>
      <CardHeader title="Study buddy permissions" description="Grant visibility by exact CA Progress user ID. This is a private access list, not profile discovery."/>
      <CardBody>
        <div className="profile-form-stack">
          <Input label="Buddy user ID" value={buddyId} maxLength={128} onChange={(event) => setBuddyId(event.target.value)} placeholder="Exact user ID"/>
          <Button variant="secondary" disabled={buddyBusy || !buddyId.trim()} onClick={() => changeBuddy("POST", buddyId.trim())}>Allow study buddy</Button>
          {settings.buddyUserIds.length ? <div>
            <strong>Allowed buddies</strong>
            <div className="profile-form-stack" style={{ marginTop: 8 }}>
              {settings.buddyUserIds.map((id) => <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><code>{id}</code><Button variant="ghost" disabled={buddyBusy} onClick={() => changeBuddy("DELETE", id)}>Remove</Button></div>)}
            </div>
          </div> : <small>No buddy access granted.</small>}
        </div>
      </CardBody>
    </Card>
  </div>;
}
