import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { CommunityChat } from "@/components/community/community-chat";
import { PageHeader } from "@/components/ui/page-header";
import { getCommunityChannelModel } from "@/lib/community/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community Channel | CA Progress" };

export default async function CommunityChannelPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const model = await getCommunityChannelModel(channel);
  if (model.mode === "guest") return <div className="phase10-page"><LoginRequired next={`/community/${encodeURIComponent(channel)}`} title="Sign in to open this Community channel"/></div>;
  if (model.mode === "setup") return <div className="phase10-page"><PageHeader preview={false} eyebrow="Community" title="Complete your academic profile first." description="Your level and group determine access to level and subject channels."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  if (model.mode === "denied") return <div className="phase10-page"><section className="phase10-denied"><h1>Channel unavailable</h1><p>This channel is not part of your current academic selection, or it is no longer active.</p><Link href="/community" className="ui-button ui-button--primary">Back to Community</Link></section></div>;
  return <div className="phase10-channel-page"><CommunityChat model={model}/></div>;
}
