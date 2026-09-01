"use client";

type CommunityRealtimeSubscription = {
  channelId: string;
  onDataChanged: () => void;
  onPinnedChanged: () => void;
};

const DATA_REFRESH_MS = 2500;
const PIN_REFRESH_MS = 10000;

/**
 * Community durable state already lives in the database and the UI only needs an
 * invalidation signal. Phase 3 therefore replaces Supabase Realtime with a small
 * provider-neutral polling adapter rather than adding a Durable Object/WebSocket
 * coordinator that the product does not need. Ordering, moderation, blocks,
 * unread state, reactions and pins remain enforced by existing server APIs.
 */
export function subscribeToCommunityRealtime({ channelId, onDataChanged, onPinnedChanged }: CommunityRealtimeSubscription) {
  if (!channelId || typeof window === "undefined") return () => undefined;

  const refreshData = () => {
    if (document.visibilityState === "visible") onDataChanged();
  };
  const refreshPins = () => {
    if (document.visibilityState === "visible") onPinnedChanged();
  };
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    onDataChanged();
    onPinnedChanged();
  };

  const dataTimer = window.setInterval(refreshData, DATA_REFRESH_MS);
  const pinTimer = window.setInterval(refreshPins, PIN_REFRESH_MS);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.clearInterval(dataTimer);
    window.clearInterval(pinTimer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
