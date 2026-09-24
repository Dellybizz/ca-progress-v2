export const COMMUNITY_PERSISTENT_EVENT_TYPES = ["message.created", "message.updated", "message.deleted", "reaction.changed", "pin.changed", "read.changed"] as const;
export const COMMUNITY_EPHEMERAL_EVENT_TYPES = ["typing.changed", "presence.changed"] as const;

export type CommunityPersistentEventType = typeof COMMUNITY_PERSISTENT_EVENT_TYPES[number];
export type CommunityEphemeralEventType = typeof COMMUNITY_EPHEMERAL_EVENT_TYPES[number];
export type CommunityPersistentEvent = {
  type: CommunityPersistentEventType;
  channelId: string;
  sequence: number;
  entityId: string;
  version: number;
  payload: Record<string, unknown>;
};
export type CommunityEphemeralEvent = {
  type: CommunityEphemeralEventType;
  channelId: string;
  userId: string;
  payload: Record<string, unknown>;
};
export type CommunityRealtimeEvent = CommunityPersistentEvent | CommunityEphemeralEvent;

export function parseCommunityRealtimeEvent(value: unknown): CommunityRealtimeEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const type = String(event.type || "");
  if ((COMMUNITY_PERSISTENT_EVENT_TYPES as readonly string[]).includes(type)) {
    if (typeof event.channelId !== "string" || typeof event.entityId !== "string" || !Number.isSafeInteger(event.sequence) || Number(event.sequence) < 1 || !Number.isSafeInteger(event.version) || Number(event.version) < 1) return null;
    return { type: type as CommunityPersistentEventType, channelId: event.channelId, entityId: event.entityId, sequence: Number(event.sequence), version: Number(event.version), payload: event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {} };
  }
  if ((COMMUNITY_EPHEMERAL_EVENT_TYPES as readonly string[]).includes(type) && typeof event.channelId === "string" && typeof event.userId === "string") {
    return { type: type as CommunityEphemeralEventType, channelId: event.channelId, userId: event.userId, payload: event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {} };
  }
  return null;
}
