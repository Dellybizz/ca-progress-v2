"use client";

type CommunityRealtimeSubscription = {
  channelId: string;
  channelSlug?: string;
  userId?: string;
  onDataChanged: () => void;
  onPinnedChanged: () => void;
  onPresenceChanged?: (payload: unknown) => void;
  onTypingChanged?: (payload: unknown) => void;
};

type CommunityRealtimeHandle = (() => void) & {
  send: (event: Record<string, unknown>) => void;
};

const DATA_REFRESH_MS = 2500;
const PIN_REFRESH_MS = 10000;
const MAX_RECONNECT_MS = 10000;

function realtimeUrl(channelSlug: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/community/channels/${encodeURIComponent(channelSlug)}/realtime`;
}

/**
 * The Durable Object coordinates ephemeral channel state only. D1 remains the
 * authority for messages, moderation, reactions, read state and access rules.
 * Polling is retained only as a bounded fallback when a socket cannot connect.
 */
export function subscribeToCommunityRealtime(input: CommunityRealtimeSubscription): CommunityRealtimeHandle {
  const noop = (() => undefined) as CommunityRealtimeHandle;
  noop.send = () => undefined;
  if (!input.channelId || !input.channelSlug || typeof window === "undefined" || typeof WebSocket === "undefined") return noop;

  const presenceId = input.userId || `guest:${crypto.randomUUID()}`;
  let socket: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: number | null = null;
  let reconnectMs = 500;
  let fallbackDataTimer: number | null = null;
  let fallbackPinTimer: number | null = null;

  const refreshData = () => {
    if (document.visibilityState === "visible") input.onDataChanged();
  };
  const refreshPins = () => {
    if (document.visibilityState === "visible") input.onPinnedChanged();
  };
  const startFallback = () => {
    if (fallbackDataTimer === null) fallbackDataTimer = window.setInterval(refreshData, DATA_REFRESH_MS);
    if (fallbackPinTimer === null) fallbackPinTimer = window.setInterval(refreshPins, PIN_REFRESH_MS);
  };
  const stopFallback = () => {
    if (fallbackDataTimer !== null) window.clearInterval(fallbackDataTimer);
    if (fallbackPinTimer !== null) window.clearInterval(fallbackPinTimer);
    fallbackDataTimer = null;
    fallbackPinTimer = null;
  };
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    input.onDataChanged();
    input.onPinnedChanged();
  };
  const connect = () => {
    if (closed) return;
    try { socket = new WebSocket(realtimeUrl(input.channelSlug!)); } catch { startFallback(); return; }
    socket.addEventListener("open", () => {
      reconnectMs = 500;
      stopFallback();
      socket?.send(JSON.stringify({ type: "presence", userId: presenceId, state: "online" }));
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (payload.type === "refresh") {
          if (payload.reason === "pin" || payload.reason === "moderation") input.onPinnedChanged();
          input.onDataChanged();
        } else if (payload.type === "presence") input.onPresenceChanged?.(payload);
        else if (payload.type === "typing") input.onTypingChanged?.(payload);
      } catch { /* malformed ephemeral events are ignored */ }
    });
    socket.addEventListener("close", () => {
      socket = null;
      if (closed) return;
      startFallback();
      reconnectTimer = window.setTimeout(connect, reconnectMs);
      reconnectMs = Math.min(MAX_RECONNECT_MS, reconnectMs * 2);
    });
    socket.addEventListener("error", () => socket?.close());
  };
  connect();
  document.addEventListener("visibilitychange", onVisibility);

  const handle = (() => {
    closed = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    stopFallback();
    document.removeEventListener("visibilitychange", onVisibility);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "presence", userId: presenceId, state: "offline" }));
    socket?.close();
    socket = null;
  }) as CommunityRealtimeHandle;
  handle.send = (event) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };
  return handle;
}
