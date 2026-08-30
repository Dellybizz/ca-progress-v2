import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { CommunityChannelGroup } from "@/lib/community/types";

function preview(body: string | null) {
  if (!body) return "No messages yet";
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 70 ? `${text.slice(0, 67)}…` : text;
}

export function CommunityChannelList({ groups, activeSlug }: { groups: CommunityChannelGroup[]; activeSlug?: string | null }) {
  return <nav className="phase10-channel-list" aria-label="Community channels">
    {groups.map((group) => <section key={group.label} className="phase10-channel-group">
      <h2>{group.label}</h2>
      <div>{group.channels.map((channel) => {
        const active = channel.slug === activeSlug;
        return <Link key={channel.id} href={`/community/${channel.slug}`} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
          <span className={`phase10-channel-icon phase10-channel-icon--${channel.kind}`}><Icon name={channel.kind === "announcements" ? "bell" : channel.kind === "resources" ? "book" : channel.kind === "doubts" ? "community" : "chat"} size={18}/></span>
          <span className="phase10-channel-copy"><span><strong>{channel.title}</strong>{channel.latestAt ? <time>{new Date(channel.latestAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</time> : null}</span><small>{channel.latestAuthor ? `${channel.latestAuthor}: ` : ""}{preview(channel.latestBody)}</small></span>
          {channel.unreadCount > 0 ? <span className="phase10-unread" aria-label={`${channel.unreadCount} unread`}>{channel.unreadCount > 99 ? "99+" : channel.unreadCount}</span> : null}
        </Link>;
      })}</div>
    </section>)}
  </nav>;
}
