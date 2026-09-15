"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type Sharing = {
  shareProfile: boolean;
  shareProgress: boolean;
  shareStreak: boolean;
  shareGoals: boolean;
  shareStudyStatus: boolean;
};
type RequestItem = { relationshipId: string; userId: string; displayName: string; requestedAt: string };
type Goal = {
  id: string;
  title: string;
  week_start: string;
  target_minutes_per_person: number;
  status: string;
  contributions: Record<string, number>;
};
type Together = {
  id: string;
  status: string;
  started_at: string;
  participants: { user_id: string; joined_at: string | null; canonical_study_session_id: string | null; completed_at: string | null }[];
};
type Buddy = {
  relationshipId: string;
  userId: string;
  displayName: string;
  mySharing: Sharing;
  buddySharing: Sharing;
  muted: boolean;
  accountability: { publicBio?: string; caLevel?: string; attemptKey?: string; weekStudyMinutes?: number; currentStreakDays?: number };
  goals: Goal[];
  studyTogether: Together | null;
};
export type StudyBuddyDashboard = {
  incomingRequests: RequestItem[];
  outgoingRequests: RequestItem[];
  buddies: Buddy[];
  recentNudges: { id: string; sender_user_id: string; sender_display_name: string | null; message: string; created_at: string }[];
  nudgeLimitPer24Hours: number;
};

function currentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function StudyBuddyWorkspace({ ownerUserId, initialDashboard }: { ownerUserId: string; initialDashboard: StudyBuddyDashboard }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [buddyId, setBuddyId] = useState("");

  async function refresh() {
    const response = await fetch("/api/study-buddy", { cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; dashboard?: StudyBuddyDashboard; error?: string };
    if (!response.ok || !payload.dashboard) throw new Error(payload.error || "Study Buddy could not be refreshed.");
    setDashboard(payload.dashboard);
  }

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/study-buddy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Study Buddy could not be updated.");
      await refresh();
      setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Study Buddy could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  function requestBuddy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!buddyId.trim()) return;
    const requestedId = buddyId.trim();
    void mutate({ action: "request", buddyUserId: requestedId }, "Study Buddy request sent.");
    setBuddyId("");
  }

  function toggleSharing(buddy: Buddy, key: keyof Sharing) {
    void mutate({ action: "sharing", buddyUserId: buddy.userId, ...buddy.mySharing, [key]: !buddy.mySharing[key] }, "Relationship privacy updated.");
  }

  function createGoal(event: FormEvent<HTMLFormElement>, buddy: Buddy) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({
      action: "createGoal",
      buddyUserId: buddy.userId,
      title: form.get("title"),
      weekStart: form.get("weekStart"),
      targetMinutesPerPerson: Number(form.get("targetMinutesPerPerson")),
    }, "Shared weekly goal created.");
    event.currentTarget.reset();
  }

  function contributeGoal(event: FormEvent<HTMLFormElement>, goal: Goal) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({ action: "contributeGoal", goalId: goal.id, studySessionId: form.get("studySessionId") }, "Your canonical study session was added to this goal.");
  }

  function completeTogether(event: FormEvent<HTMLFormElement>, together: Together) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({ action: "completeTogether", studyTogetherId: together.id, studySessionId: form.get("studySessionId") }, "Study Together completion linked without duplicate credit.");
  }

  return <main className="study-buddy-page">
    <PageHeader eyebrow="Accountability" title="Study Buddy" description="Private, opt-in accountability for CA study. No public follower graph, audio, or video." preview={false}/>

    {error ? <div className="study-buddy-alert study-buddy-alert--error" role="alert">{error}</div> : null}
    {notice ? <div className="study-buddy-alert study-buddy-alert--success" role="status">{notice}</div> : null}

    <Card>
      <div className="study-buddy-section-head"><div><h2>Connect by user ID</h2><p>Requests reveal no private accountability data until accepted. Sharing stays off after acceptance until each person opts in.</p></div></div>
      <form className="study-buddy-inline-form" onSubmit={requestBuddy}>
        <input value={buddyId} onChange={(event) => setBuddyId(event.target.value)} placeholder="CA Progress user ID" aria-label="Study buddy user ID" maxLength={128}/>
        <Button type="submit" disabled={busy}>Send request</Button>
      </form>
    </Card>

    {dashboard.incomingRequests.length || dashboard.outgoingRequests.length ? <Card>
      <div className="study-buddy-section-head"><div><h2>Requests</h2><p>Only explicit acceptance creates an accountability relationship.</p></div></div>
      <div className="study-buddy-request-list">
        {dashboard.incomingRequests.map((request) => <div key={request.relationshipId} className="study-buddy-request">
          <div><strong>{request.displayName}</strong><small>{request.userId}</small></div>
          <div className="study-buddy-actions">
            <Button disabled={busy} onClick={() => void mutate({ action: "respond", buddyUserId: request.userId, response: "accept" }, "Study Buddy request accepted.")}>Accept</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void mutate({ action: "respond", buddyUserId: request.userId, response: "reject" }, "Study Buddy request rejected.")}>Reject</Button>
          </div>
        </div>)}
        {dashboard.outgoingRequests.map((request) => <div key={request.relationshipId} className="study-buddy-request">
          <div><strong>{request.displayName}</strong><small>{request.userId}</small></div><span className="study-buddy-pill">Pending</span>
        </div>)}
      </div>
    </Card> : null}

    <section className="study-buddy-grid" aria-label="Accepted study buddies">
      {dashboard.buddies.map((buddy) => <Card key={buddy.relationshipId} className="study-buddy-card">
        <div className="study-buddy-card-head">
          <div><h2>{buddy.displayName}</h2><small>{buddy.userId}</small></div>
          <span className="study-buddy-pill study-buddy-pill--accepted">Accepted</span>
        </div>

        <div className="study-buddy-sharing">
          <h3>What I share with this buddy</h3>
          {([
            ["shareProfile", "Profile details"], ["shareProgress", "7-day study minutes"], ["shareStreak", "Study streak"],
            ["shareGoals", "Shared weekly goals"], ["shareStudyStatus", "Study Together status"],
          ] as [keyof Sharing, string][]).map(([key, label]) => <label key={key}>
            <input type="checkbox" checked={buddy.mySharing[key]} disabled={busy} onChange={() => toggleSharing(buddy, key)}/><span>{label}</span>
          </label>)}
        </div>

        <div className="study-buddy-accountability">
          <h3>Shared with me</h3>
          {Object.keys(buddy.accountability).length ? <dl>
            {buddy.accountability.publicBio ? <><dt>Bio</dt><dd>{buddy.accountability.publicBio}</dd></> : null}
            {buddy.accountability.caLevel ? <><dt>CA level</dt><dd>{buddy.accountability.caLevel}</dd></> : null}
            {buddy.accountability.attemptKey ? <><dt>Attempt</dt><dd>{buddy.accountability.attemptKey}</dd></> : null}
            {typeof buddy.accountability.weekStudyMinutes === "number" ? <><dt>Last 7 days</dt><dd>{buddy.accountability.weekStudyMinutes} min</dd></> : null}
            {typeof buddy.accountability.currentStreakDays === "number" ? <><dt>Current streak</dt><dd>{buddy.accountability.currentStreakDays} days</dd></> : null}
          </dl> : <p className="study-buddy-muted">This buddy has not opted to share accountability fields with you.</p>}
        </div>

        <div className="study-buddy-actions study-buddy-actions--wrap">
          <Button disabled={busy} onClick={() => void mutate({ action: "nudge", buddyUserId: buddy.userId }, "Nudge sent.")}>Nudge</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void mutate({ action: "safety", buddyUserId: buddy.userId, mode: buddy.muted ? "unmute" : "mute" }, buddy.muted ? "Buddy unmuted." : "Buddy muted.")}>{buddy.muted ? "Unmute" : "Mute"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void mutate({ action: "remove", buddyUserId: buddy.userId }, "Study Buddy removed.")}>Remove</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void mutate({ action: "safety", buddyUserId: buddy.userId, mode: "block" }, "Account blocked and relationship ended.")}>Block</Button>
        </div>
        <p className="study-buddy-limit">Nudges are limited to {dashboard.nudgeLimitPer24Hours} per buddy per 24 hours. Recipient mute is enforced on the server.</p>

        <div className="study-buddy-subsection">
          <h3>Shared weekly goals</h3>
          {buddy.mySharing.shareGoals && buddy.buddySharing.shareGoals ? <>
            <form className="study-buddy-form-grid" onSubmit={(event) => createGoal(event, buddy)}>
              <input name="title" placeholder="Goal, e.g. Audit revision" required maxLength={120}/>
              <input name="weekStart" type="date" defaultValue={currentWeekStart()} required/>
              <input name="targetMinutesPerPerson" type="number" min={1} max={10080} defaultValue={300} required/>
              <Button type="submit" disabled={busy}>Create shared goal</Button>
            </form>
            <div className="study-buddy-goals">{buddy.goals.map((goal) => <article key={goal.id}>
              <strong>{goal.title}</strong><small>Week of {goal.week_start} · {goal.target_minutes_per_person} min each</small>
              <div className="study-buddy-contributions">
                <span>You: {goal.contributions[ownerUserId] ?? 0} min</span><span>{buddy.displayName}: {goal.contributions[buddy.userId] ?? 0} min</span>
              </div>
              <form className="study-buddy-inline-form" onSubmit={(event) => contributeGoal(event, goal)}>
                <input name="studySessionId" placeholder="Your completed study session ID" required/>
                <Button type="submit" disabled={busy}>Add session</Button>
              </form>
            </article>)}</div>
          </> : <p className="study-buddy-muted">Both buddies must enable Shared weekly goals before either person can create or contribute.</p>}
        </div>

        <div className="study-buddy-subsection">
          <h3>Study Together</h3>
          <p className="study-buddy-muted">A lightweight synchronized accountability session. It has no audio/video and never creates a second study record.</p>
          {buddy.mySharing.shareStudyStatus && buddy.buddySharing.shareStudyStatus ? buddy.studyTogether ? <div className="study-buddy-together">
            <strong>Active since {new Date(buddy.studyTogether.started_at).toLocaleString()}</strong>
            {buddy.studyTogether.participants.find((participant) => participant.user_id === ownerUserId)?.joined_at ? null : <Button disabled={busy} onClick={() => void mutate({ action: "joinTogether", studyTogetherId: buddy.studyTogether?.id }, "Joined Study Together.")}>Join</Button>}
            <form className="study-buddy-inline-form" onSubmit={(event) => completeTogether(event, buddy.studyTogether as Together)}>
              <input name="studySessionId" placeholder="Your overlapping completed study session ID" required/>
              <Button type="submit" disabled={busy}>Link completion</Button>
            </form>
          </div> : <Button disabled={busy} onClick={() => void mutate({ action: "startTogether", buddyUserId: buddy.userId }, "Study Together started.")}>Start Study Together</Button> : <p className="study-buddy-muted">Both buddies must enable Study Together status before starting.</p>}
        </div>

        <form className="study-buddy-report" onSubmit={(event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          void mutate({ action: "report", buddyUserId: buddy.userId, reason: form.get("reason"), details: form.get("details") }, "Report submitted for review.");
          event.currentTarget.reset();
        }}>
          <h3>Report safety issue</h3>
          <input name="reason" placeholder="Reason" required maxLength={80}/>
          <textarea name="details" placeholder="Optional details" maxLength={600}/>
          <Button variant="secondary" type="submit" disabled={busy}>Report</Button>
        </form>
      </Card>)}
    </section>

    {!dashboard.buddies.length ? <Card><div className="study-buddy-empty"><strong>No accepted Study Buddies yet</strong><p>Send a request using an exact CA Progress user ID. There is no public people-search or follower feed.</p></div></Card> : null}

    {dashboard.recentNudges.length ? <Card>
      <div className="study-buddy-section-head"><div><h2>Recent nudges</h2><p>Short accountability prompts from accepted buddies.</p></div></div>
      <div className="study-buddy-nudges">{dashboard.recentNudges.map((nudge) => <div key={nudge.id}><strong>{nudge.sender_display_name || "Study buddy"}</strong><span>{nudge.message}</span><time>{new Date(nudge.created_at).toLocaleString()}</time></div>)}</div>
    </Card> : null}
  </main>;
}
