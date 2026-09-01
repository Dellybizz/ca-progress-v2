"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type CommunityRealtimeSubscription = {
  channelId: string;
  onDataChanged: () => void;
  onPinnedChanged: () => void;
};

/**
 * Provider-neutral realtime boundary for Community UI. The Phase 1 adapter is
 * still Supabase Realtime; callers no longer know how the subscription is made.
 */
export function subscribeToCommunityRealtime({ channelId, onDataChanged, onPinnedChanged }: CommunityRealtimeSubscription) {
  const client = createBrowserSupabaseClient();
  const filter = `channel_id=eq.${channelId}`;
  const channel = client
    .channel(`community:${channelId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "community_messages", filter }, onDataChanged)
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter }, onDataChanged)
    .on("postgres_changes", { event: "*", schema: "public", table: "pinned_messages", filter }, onPinnedChanged)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
