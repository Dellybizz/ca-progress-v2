"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { subscribeToCommunityRealtime } from "@/lib/community/realtime-provider";
import type { CommunityChannelModel, CommunityMessage, CommunityMessagePage, CommunityReactionEmoji } from "@/lib/community/types";
import { CommunityChannelList } from "./channel-list";

const REACTIONS: CommunityReactionEmoji[] = ["👍", "❤️", "🎯", "👏", "💡", "✅"];

type ReadyModel = Extract<CommunityChannelModel, { mode: "ready" }>;

function dedupeMessages(messages: CommunityMessage[]) {
  const map = new Map<string, CommunityMessage>();
  for (const message of messages) map.set(message.id, message);
  return [...map.values()].sort((a, b) => a.sequence - b.sequence);
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function shortBody(body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 100 ? `${text.slice(0, 97)}…` : text;
}

export function CommunityChat({ model }: { model: ReadyModel }) {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState(model.messages);
  const [nextCursor, setNextCursor] = useState(model.nextCursor);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [resourceId, setResourceId] = useState("");
  const [mentionUserId, setMentionUserId] = useState("");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState(model.pinned);
  const latestSequence = messages.at(-1)?.sequence ?? model.channel.latestSequence ?? 0;
  const isGuest = !model.viewerId;

  const markRead = useCallback(async (sequence: number) => {
    if (isGuest) return;
    await fetch(`/api/community/channels/${encodeURIComponent(model.channel.slug)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence }),
    }).catch(() => null);
  }, [isGuest, model.channel.slug]);

  const refreshMessages = useCallback(async (search = activeQuery) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    const response = await fetch(`/api/community/channels/${encodeURIComponent(model.channel.slug)}/messages?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as CommunityMessagePage & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Messages could not be refreshed.");
    setMessages(payload.messages);
    setNextCursor(payload.nextCursor);
    const sequence = payload.messages.at(-1)?.sequence ?? 0;
    if (sequence && !isGuest) void markRead(sequence);
  }, [activeQuery, isGuest, markRead, model.channel.slug]);

  useEffect(() => {
    if (latestSequence && !isGuest) void markRead(latestSequence);
  }, [isGuest, latestSequence, markRead]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshMessages().catch(() => undefined), 120);
    };
    const unsubscribe = subscribeToCommunityRealtime({
      channelId: model.channel.id,
      onDataChanged: scheduleRefresh,
      onPinnedChanged: () => {
        scheduleRefresh();
        router.refresh();
      },
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [model.channel.id, refreshMessages, router]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    requestAnimationFrame(() => { element.scrollTop = element.scrollHeight; });
  }, []);

  async function loadOlder() {
    if (!nextCursor) return;
    setBusy("older");
    setError(null);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      if (activeQuery) params.set("q", activeQuery);
      const response = await fetch(`/api/community/channels/${encodeURIComponent(model.channel.slug)}/messages?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as CommunityMessagePage & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Older messages could not be loaded.");
      setMessages((current) => dedupeMessages([...payload.messages, ...current]));
      setNextCursor(payload.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Older messages could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || !model.channel.canWrite || model.activeBlock) return;
    setBusy("send");
    setError(null);
    try {
      const response = await fetch(`/api/community/channels/${encodeURIComponent(model.channel.slug)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, replyToId: replyTo?.id ?? null, resourceId: resourceId || null, mentionUserIds: mentionUserId ? [mentionUserId] : [] }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Message could not be sent.");
      setBody("");
      setReplyTo(null);
      setResourceId("");
      setMentionUserId("");
      await refreshMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      setBusy(null);
    }
  }

  async function react(messageId: string, emoji: CommunityReactionEmoji) {
    if (isGuest) return;
    setBusy(`reaction:${messageId}:${emoji}`);
    setError(null);
    try {
      const response = await fetch(`/api/community/messages/${messageId}/reaction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Reaction could not be updated.");
      await refreshMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reaction could not be updated.");
    } finally { setBusy(null); }
  }

  async function report(message: CommunityMessage) {
    if (isGuest) return;
    const reason = window.prompt("Report reason: spam, harassment, misinformation, off_topic or other", "spam")?.trim();
    if (!reason) return;
    const details = window.prompt("Optional details", "") ?? "";
    setBusy(`report:${message.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/community/messages/${message.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, details }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Message could not be reported.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be reported.");
    } finally { setBusy(null); }
  }

  async function moderate(action: string, message: CommunityMessage, durationMinutes?: number) {
    const reason = action === "pin" || action === "unpin" ? null : window.prompt("Moderation reason", action === "block" ? "Chat violation" : "Community moderation");
    if ((action === "delete_message" || action === "block") && reason === null) return;
    setBusy(`moderate:${message.id}:${action}`);
    setError(null);
    try {
      const response = await fetch("/api/admin/community/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, messageId: message.id, channelId: model.channel.id, reason, durationMinutes }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Moderation action failed.");
      if (action === "pin") setPinned(message);
      if (action === "unpin") setPinned(null);
      await refreshMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Moderation action failed.");
    } finally { setBusy(null); }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim().slice(0, 80);
    setActiveQuery(clean);
    setBusy("search");
    setError(null);
    try { await refreshMessages(clean); } catch (err) { setError(err instanceof Error ? err.message : "Search failed."); } finally { setBusy(null); }
  }

  const mentionLabel = useMemo(() => model.members.find((member) => member.userId === mentionUserId)?.label ?? null, [mentionUserId, model.members]);

  return <div className="phase10-split-chat">
    <aside className="phase10-chat-sidebar"><div className="phase10-chat-sidebar-head"><Link href="/community" className="phase10-back"><Icon name="arrow" size={16}/>Community</Link><strong>Channels</strong></div><CommunityChannelList groups={model.groups} activeSlug={model.channel.slug}/></aside>
    <section className="phase10-chat-panel" aria-label={`${model.channel.title} chat`}>
      <header className="phase10-chat-header">
        <div><Link href="/community" className="phase10-mobile-back" aria-label="Back to channels">‹</Link><span className={`phase10-channel-icon phase10-channel-icon--${model.channel.kind}`}><Icon name={model.channel.kind === "announcements" ? "bell" : model.channel.kind === "resources" ? "book" : "community"} size={18}/></span><div><h1>{model.channel.title}</h1><p>{model.channel.description}</p></div></div>
        <form onSubmit={search} className="phase10-chat-search"><Icon name="search" size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" maxLength={80}/>{activeQuery ? <button type="button" onClick={() => { setQuery(""); setActiveQuery(""); void refreshMessages(""); }} aria-label="Clear search"><Icon name="close" size={14}/></button> : null}</form>
      </header>

      {pinned ? <button className="phase10-pinned" type="button" onClick={() => document.getElementById(`message-${pinned.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Icon name="bell" size={16}/><span><strong>Pinned</strong>{shortBody(pinned.body)}</span></button> : null}
      {model.activeBlock ? <div className="phase10-block-notice"><Icon name="lock" size={17}/><span><strong>Chat access temporarily limited</strong>{model.activeBlock.reason} · until {new Date(model.activeBlock.endsAt).toLocaleString()}</span></div> : null}
      {error ? <div className="phase10-error" role="alert">{error}</div> : null}

      <div ref={listRef} className="phase10-message-scroll">
        <div className="phase10-history-controls">{nextCursor ? <button type="button" disabled={busy === "older"} onClick={() => void loadOlder()}>{busy === "older" ? "Loading…" : "Load older messages"}</button> : <span>{activeQuery ? "Start of matching messages" : "Start of this channel"}</span>}</div>
        {messages.length ? <div className="phase10-messages">{messages.map((message) => <article id={`message-${message.id}`} key={message.id} className={`phase10-message ${message.isOwn ? "is-own" : ""} ${message.isPinned ? "is-pinned" : ""} ${message.moderationStatus !== "active" ? "is-moderated" : ""}`}>
          <div className="phase10-avatar" aria-hidden="true">{message.authorLabel.charAt(0).toUpperCase()}</div>
          <div className="phase10-message-body">
            <div className="phase10-message-meta"><strong>{message.authorLabel}</strong><time>{timeLabel(message.createdAt)}</time>{message.isPinned ? <span>Pinned</span> : null}</div>
            {message.replyTo ? <button className="phase10-reply-preview" type="button" onClick={() => document.getElementById(`message-${message.replyTo!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><strong>{message.replyTo.authorLabel}</strong><span>{shortBody(message.replyTo.body)}</span></button> : null}
            <p>{message.body}</p>
            {message.attachment ? <a className="phase10-attachment" href={`/resources/${message.attachment.id}`}><Icon name="book" size={16}/><span><strong>{message.attachment.title}</strong><small>{message.attachment.extension.toUpperCase()} · approved community resource</small></span></a> : null}
            {message.moderationStatus === "active" ? <div className="phase10-message-actions">{model.viewerId ? <button type="button" onClick={() => setReplyTo(message)}>Reply</button> : null}{model.viewerId && !message.isOwn ? <button type="button" disabled={busy === `report:${message.id}`} onClick={() => void report(message)}>Report</button> : null}{model.canModerate ? <><button type="button" onClick={() => void moderate(message.isPinned ? "unpin" : "pin", message)}>{message.isPinned ? "Unpin" : "Pin"}</button><button type="button" onClick={() => void moderate("delete_message", message)}>Remove</button>{!message.isOwn ? <select aria-label={`Block ${message.authorLabel}`} defaultValue="" onChange={(event) => { const minutes = Number(event.target.value); if (minutes) void moderate("block", message, minutes); event.currentTarget.value = ""; }}><option value="">Block…</option><option value="60">1 hour</option><option value="480">8 hours</option><option value="1440">24 hours</option><option value="2880">48 hours</option></select> : null}</> : null}</div> : null}
            {message.moderationStatus === "active" ? <div className="phase10-reactions">{message.reactions.map((reaction) => <button key={reaction.emoji} className={reaction.reactedByViewer ? "is-active" : ""} onClick={() => void react(message.id, reaction.emoji)} disabled={isGuest || busy === `reaction:${message.id}:${reaction.emoji}`}><span>{reaction.emoji}</span>{reaction.count}</button>)}{model.viewerId ? <details><summary aria-label="Add reaction">＋</summary><div>{REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => void react(message.id, emoji)}>{emoji}</button>)}</div></details> : null}</div> : null}
          </div>
        </article>)}</div> : <div className="phase10-chat-empty"><Icon name="community" size={28}/><strong>{activeQuery ? "No matching messages" : "Start the conversation"}</strong><p>{activeQuery ? "Try a different search term." : model.channel.canWrite ? "Share a question, useful explanation or approved resource." : "This channel is currently read-only for your role."}</p></div>}
      </div>

      <form className="phase10-composer" onSubmit={send}>
        {replyTo ? <div className="phase10-composer-context"><span><strong>Replying to {replyTo.authorLabel}</strong>{shortBody(replyTo.body)}</span><button type="button" onClick={() => setReplyTo(null)}><Icon name="close" size={14}/></button></div> : null}
        {mentionLabel ? <div className="phase10-composer-context"><span><strong>Mentioning @{mentionLabel}</strong>The mentioned student will receive a notification.</span><button type="button" onClick={() => setMentionUserId("")}><Icon name="close" size={14}/></button></div> : null}
        <div className="phase10-composer-tools"><select value={mentionUserId} onChange={(event) => setMentionUserId(event.target.value)} disabled={!model.channel.canWrite || Boolean(model.activeBlock)}><option value="">@ Mention</option>{model.members.map((member) => <option key={member.userId} value={member.userId}>@{member.label}</option>)}</select><select value={resourceId} onChange={(event) => setResourceId(event.target.value)} disabled={!model.channel.canWrite || Boolean(model.activeBlock)}><option value="">Attach approved resource</option>{model.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title} · {resource.extension.toUpperCase()}</option>)}</select></div>
        <div className="phase10-composer-row"><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={model.activeBlock ? "Chat is temporarily blocked" : model.channel.canWrite ? `Message #${model.channel.title}` : "Sign in to chat"} disabled={!model.channel.canWrite || Boolean(model.activeBlock)} rows={1}/><span>{body.length}/2000</span><button className="ui-button ui-button--primary" disabled={!body.trim() || !model.channel.canWrite || Boolean(model.activeBlock) || busy === "send"}>{busy === "send" ? "Sending…" : model.viewerId ? "Send" : "Sign in to chat"}</button></div>
      </form>
    </section>
  </div>;
}
