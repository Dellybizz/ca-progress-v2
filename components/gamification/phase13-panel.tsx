"use client";

import { useState } from "react";

type Level = { name: string };
type Reward = { id: string; competitionPeriod: string; rewardPeriod: string; rank: number; rewardTier: "premium" | "pro"; status: string; startsAt: string; endsAt: string };
type ShareCard = { kind: string; title: string; primary: string; secondary: string };
type Phase13Model = {
  effectiveTotalXp: number;
  bonusXp: number;
  effectiveLevel: Level;
  leaderboard: { optedIn: boolean; publicAlias: string; category: "overall"; period: string; rank: number | null };
  referral: {
    code: string;
    activationRequiredSessions: number;
    activationXp: number;
    inbound: { status: string; qualifyingSessionCount: number } | null;
    outgoing: { total: number; activated: number; pending: number };
  };
  rewards: Reward[];
  shareCards: ShareCard[];
};
type LeaderboardEntry = { rank: number; displayName: string; totalXp: number; levelName: string };
type LeaderboardResponse = { ok?: boolean; error?: string; leaderboard?: { category: string; period: string; entries: LeaderboardEntry[] } };
type ModelResponse = { ok?: boolean; error?: string; model?: Phase13Model };

const categories = [
  ["overall", "Overall"],
  ["foundation", "Foundation"],
  ["intermediate", "Intermediate"],
  ["final", "Final"],
] as const;

const panelStyle = { display: "grid", gap: 16 } as const;
const boxStyle = { border: "1px solid var(--border, #e5e7eb)", borderRadius: 14, padding: 16, display: "grid", gap: 12 } as const;
const rowStyle = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" } as const;
const buttonStyle = { border: "1px solid var(--border, #d1d5db)", borderRadius: 10, padding: "8px 12px", background: "var(--card, #fff)", cursor: "pointer" } as const;

function shareText(card: ShareCard) {
  return `${card.title}\n${card.primary}${card.secondary ? `\n${card.secondary}` : ""}\nCA Progress`;
}

async function cardBlob(card: ShareCard) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Share card could not be rendered.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111827";
  context.font = "600 44px system-ui, sans-serif";
  context.fillText("CA Progress", 80, 110);
  context.font = "500 50px system-ui, sans-serif";
  context.fillText(card.title.slice(0, 34), 80, 300);
  context.font = "700 84px system-ui, sans-serif";
  context.fillText(card.primary.slice(0, 26), 80, 470);
  context.font = "400 38px system-ui, sans-serif";
  const words = card.secondary.split(/\s+/);
  let line = "";
  let y = 580;
  for (const word of words) {
    const candidate = `${line}${line ? " " : ""}${word}`;
    if (context.measureText(candidate).width > 900 && line) {
      context.fillText(line, 80, y);
      y += 54;
      line = word;
    } else line = candidate;
  }
  if (line) context.fillText(line, 80, y);
  context.font = "400 30px system-ui, sans-serif";
  context.fillText("Shared voluntarily from CA Progress", 80, 980);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Share card could not be encoded.")), "image/png"));
}

async function downloadCard(card: ShareCard) {
  const blob = await cardBlob(card);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ca-progress-${card.kind}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function shareInstagram(card: ShareCard) {
  const blob = await cardBlob(card);
  const file = new File([blob], `ca-progress-${card.kind}.png`, { type: "image/png" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: card.title, text: shareText(card), files: [file] });
    return;
  }
  await downloadCard(card);
}

export function Phase13Panel({ initial, initialReferralCode = "" }: { initial: Phase13Model; initialReferralCode?: string }) {
  const safeInitialReferralCode = /^[A-Z0-9]{8,32}$/.test(initialReferralCode) ? initialReferralCode : "";
  const [model, setModel] = useState(initial);
  const [alias, setAlias] = useState(initial.leaderboard.publicAlias);
  const [category, setCategory] = useState("overall");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [referralInput, setReferralInput] = useState(initial.referral.inbound ? "" : safeInitialReferralCode);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/gamification/phase13", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const payload = await response.json() as ModelResponse;
      if (!response.ok || !payload.ok || !payload.model) throw new Error(payload.error || "Action failed.");
      setModel(payload.model);
      setAlias(payload.model.leaderboard.publicAlias);
      return payload.model;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
      return null;
    } finally { setBusy(false); }
  }

  async function savePreference(optedIn: boolean) {
    const next = await post({ action: "leaderboard_preference", optedIn, publicAlias: alias });
    if (next) {
      setMessage(optedIn ? "Leaderboard participation enabled." : "Leaderboard participation disabled. Your study data is not published.");
      if (optedIn) await loadLeaderboard(category);
      else setEntries([]);
    }
  }

  async function loadLeaderboard(nextCategory: string) {
    setCategory(nextCategory);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/leaderboard?category=${encodeURIComponent(nextCategory)}`, { cache: "no-store" });
      const payload = await response.json() as LeaderboardResponse;
      if (!response.ok || !payload.ok || !payload.leaderboard) throw new Error(payload.error || "Leaderboard could not be loaded.");
      setEntries(payload.leaderboard.entries);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Leaderboard could not be loaded."); }
    finally { setBusy(false); }
  }

  async function claimReferral() {
    const next = await post({ action: "claim_referral", code: referralInput });
    if (next) {
      setReferralInput("");
      setMessage(`Referral recorded. It activates only after ${next.referral.activationRequiredSessions} qualifying study sessions.`);
    }
  }

  async function copyReferral() {
    await navigator.clipboard.writeText(model.referral.code);
    setMessage("Referral code copied.");
  }

  async function copyReferralLink() {
    const referralLink = `${window.location.origin}/activity?ref=${encodeURIComponent(model.referral.code)}`;
    await navigator.clipboard.writeText(referralLink);
    setMessage("Referral link copied. Signup alone grants no XP; activation still requires qualifying study.");
  }

  function shareWhatsApp(card: ShareCard) {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText(card))}`, "_blank", "noopener,noreferrer");
  }

  return <div style={panelStyle}>
    <div id="leaderboard" style={boxStyle}>
      <div><strong>Monthly leaderboard · opt-in only</strong><p>Only your chosen public alias, rank, XP and professional level can appear. Study sessions, chapter details and account identifiers stay private.</p></div>
      <div style={rowStyle}>
        <input aria-label="Public leaderboard alias" value={alias} maxLength={40} onChange={(event) => setAlias(event.target.value)} placeholder="Public alias" style={{ minWidth: 220, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border, #d1d5db)" }}/>
        {model.leaderboard.optedIn
          ? <button disabled={busy} style={buttonStyle} onClick={() => savePreference(false)}>Opt out</button>
          : <button disabled={busy} style={buttonStyle} onClick={() => savePreference(true)}>Opt in</button>}
        {model.leaderboard.optedIn ? <button disabled={busy} style={buttonStyle} onClick={() => savePreference(true)}>Save alias</button> : null}
      </div>
      <small>{model.leaderboard.optedIn ? `Participating as ${model.leaderboard.publicAlias}${model.leaderboard.rank ? ` · Overall rank #${model.leaderboard.rank}` : ""}` : "You are not visible on any leaderboard."}</small>
      {model.leaderboard.optedIn ? <>
        <div style={rowStyle}>{categories.map(([key, label]) => <button key={key} disabled={busy} aria-pressed={category === key} style={buttonStyle} onClick={() => loadLeaderboard(key)}>{label}</button>)}</div>
        {entries.length ? <div style={{ display: "grid", gap: 6 }}>{entries.slice(0, 25).map((entry) => <div key={`${entry.rank}:${entry.displayName}`} style={{ display: "grid", gridTemplateColumns: "48px minmax(120px,1fr) auto", gap: 12 }}><strong>#{entry.rank}</strong><span>{entry.displayName}<br/><small>{entry.levelName}</small></span><strong>{entry.totalXp.toLocaleString()} XP</strong></div>)}</div> : <button disabled={busy} style={buttonStyle} onClick={() => loadLeaderboard(category)}>Load leaderboard</button>}
      </> : null}
    </div>

    <div style={boxStyle}>
      <div><strong>Activation-based referrals</strong><p>Signup alone earns no XP. Your referral becomes rewarding only after the friend records {model.referral.activationRequiredSessions} qualifying study sessions; then you receive +{model.referral.activationXp} XP once.</p></div>
      <div style={rowStyle}><code>{model.referral.code}</code><button style={buttonStyle} onClick={copyReferral}>Copy my code</button><button style={buttonStyle} onClick={copyReferralLink}>Copy referral link</button></div>
      <small>The referral link only prefills the code. The friend still chooses Apply code, and no reward exists until qualifying study activity is completed.</small>
      <small>{model.referral.outgoing.activated} activated · {model.referral.outgoing.pending} pending</small>
      {model.referral.inbound ? <small>Your referral activation: {model.referral.inbound.status} · {model.referral.inbound.qualifyingSessionCount}/{model.referral.activationRequiredSessions} qualifying sessions.</small> : <div style={rowStyle}>
        <input aria-label="Referral code" value={referralInput} maxLength={32} onChange={(event) => setReferralInput(event.target.value.toUpperCase())} placeholder="Referral code" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border, #d1d5db)" }}/>
        <button disabled={busy || !referralInput.trim()} style={buttonStyle} onClick={claimReferral}>Apply code</button>
      </div>}
      {model.bonusXp > 0 ? <small>Referral activation bonuses earned: {model.bonusXp.toLocaleString()} XP.</small> : null}
    </div>

    <div style={boxStyle}>
      <div><strong>Monthly subscription rewards</strong><p>#1 earns the configured Premium-equivalent paid plan for the next month; #2–#3 earn the configured Pro-equivalent plan. Rewards are bounded to that month and can be withheld while suspicious activity is under review.</p></div>
      {model.rewards.length ? <div style={{ display: "grid", gap: 8 }}>{model.rewards.map((reward) => <div key={reward.id}><strong>{reward.competitionPeriod} · #{reward.rank} · {reward.rewardTier === "premium" ? "Premium" : "Pro"}</strong><br/><small>{reward.status} · reward month {reward.rewardPeriod}</small></div>)}</div> : <small>No leaderboard subscription reward has been granted yet.</small>}
    </div>

    <div style={boxStyle}>
      <div><strong>Share cards</strong><p>These cards contain only the summary shown here. Sharing is always initiated by you.</p></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>{model.shareCards.map((card) => <div key={`${card.kind}:${card.title}`} style={{ ...boxStyle, padding: 12 }}>
        <small>{card.title}</small><strong>{card.primary}</strong><span>{card.secondary}</span>
        <div style={rowStyle}><button style={buttonStyle} onClick={() => shareWhatsApp(card)}>WhatsApp</button><button style={buttonStyle} onClick={() => void shareInstagram(card).catch(() => setMessage("Instagram sharing is unavailable here; use Download instead."))}>Instagram</button><button style={buttonStyle} onClick={() => void downloadCard(card).catch(() => setMessage("Share card download failed."))}>Download</button></div>
      </div>)}</div>
    </div>

    {message ? <p role="status"><small>{message}</small></p> : null}
  </div>;
}
