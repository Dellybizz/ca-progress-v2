import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Loading from "./loading";
import { LoginRequired } from "@/components/auth/login-required";
import { CommunityChannelList } from "@/components/community/channel-list";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getCommunityHomeModel } from "@/lib/community/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community | CA Progress" };

export default function CommunityPage() {
  return <Suspense fallback={<Loading />}><CommunityContent /></Suspense>;
}

async function CommunityContent() {
  const model = await getCommunityHomeModel();
  if (model.mode === "guest") return <div className="phase10-page"><LoginRequired next="/community" title="Sign in to join the CA Progress Community"/></div>;
  if (model.mode === "setup") return <div className="phase10-page"><PageHeader preview={false} eyebrow="Community" title="Complete your academic profile first." description="Your level and group decide which collaborative channels and subject Doubts rooms you can access."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase10-page"><PageHeader preview={false} eyebrow="Community V2" title="Study together without losing academic context." description="General discussion, level-specific spaces and subject Doubts are scoped to your profile, with unread state, replies, approved resources and moderation built in." actions={model.role !== "student" ? <Link href="/admin/community/moderation" className="ui-button ui-button--secondary">Moderation</Link> : undefined}/><div className="phase10-community-home"><section className="phase10-channel-home"><div className="phase10-home-summary"><div><span className="phase10-summary-icon"><Icon name="community"/></span><span><strong>{model.totalUnread}</strong><small>Total unread messages</small></span></div><div><span className="phase10-summary-icon"><Icon name="layers"/></span><span><strong>{model.groups.reduce((sum,group)=>sum+group.channels.length,0)}</strong><small>Channels available to you</small></span></div></div><CommunityChannelList groups={model.groups}/></section><aside className="phase10-notifications"><header><span><Icon name="bell" size={18}/></span><div><h2>Mentions & replies</h2><p>Unread Community notifications</p></div></header>{model.notifications.length ? <div>{model.notifications.map((notification)=><Link key={notification.id} href={`/community/${notification.channelKey}#message-${notification.messageId}`}><span className={`phase10-notification-icon phase10-notification-icon--${notification.type}`}><Icon name={notification.type === "announcement" ? "bell" : "community"} size={15}/></span><span><strong>{notification.type === "mention" ? "You were mentioned" : notification.type === "reply" ? "Someone replied to you" : "New announcement"}</strong><small>{notification.channelTitle} · {new Date(notification.createdAt).toLocaleString()}</small></span><Icon name="chevron" size={15}/></Link>)}</div> : <div className="phase10-notification-empty"><Icon name="check"/><strong>You’re caught up</strong><p>Mentions, replies and announcements will appear here.</p></div>}</aside></div></div>;
}
