type CoordinatorEvent =
  | { type: "presence"; userId: string; state: "online" | "offline"; label?: string }
  | { type: "typing"; userId: string; typing: boolean }
  | { type: "refresh"; reason: "message" | "reaction" | "read" | "pin" | "moderation" };

type DurableState = {
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
};

function safeEvent(value: unknown): CoordinatorEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (event.type === "presence" && typeof event.userId === "string" && (event.state === "online" || event.state === "offline")) {
    return { type: "presence", userId: event.userId.slice(0, 128), state: event.state, label: typeof event.label === "string" ? event.label.slice(0, 120) : undefined };
  }
  if (event.type === "typing" && typeof event.userId === "string" && typeof event.typing === "boolean") {
    return { type: "typing", userId: event.userId.slice(0, 128), typing: event.typing };
  }
  if (event.type === "refresh" && ["message", "reaction", "read", "pin", "moderation"].includes(String(event.reason))) {
    return { type: "refresh", reason: event.reason as "message" | "reaction" | "read" | "pin" | "moderation" };
  }
  return null;
}

export class CommunityChannelCoordinator {
  constructor(private readonly state: DurableState) {}

  fetch(request: Request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required.", { status: 426 });
    }

    const Pair = (globalThis as typeof globalThis & { WebSocketPair?: new () => [WebSocket, WebSocket] }).WebSocketPair;
    if (!Pair) return new Response("WebSocket runtime is unavailable.", { status: 503 });
    const pair = new Pair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";
      let parsed: unknown = null;
      try { parsed = JSON.parse(data); } catch { return; }
      const message = safeEvent(parsed);
      if (!message) return;
      this.broadcast(message, server);
    });
    server.addEventListener("close", () => undefined);
    server.addEventListener("error", () => undefined);
    server.send(JSON.stringify({ type: "ready" }));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  private broadcast(event: CoordinatorEvent, sender?: WebSocket) {
    const payload = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      if (socket === sender || socket.readyState !== WebSocket.OPEN) continue;
      try { socket.send(payload); } catch { /* disconnected sockets are cleaned by the runtime */ }
    }
  }
}
