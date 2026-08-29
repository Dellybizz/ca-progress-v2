"use client";

const GUEST_KEY = "ca-progress:v2:guest";
export type GuestIdentity = { id: string; createdAt: string; mode: "guest" };

export function getOrCreateGuestIdentity(): GuestIdentity {
  const existing = window.localStorage.getItem(GUEST_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as GuestIdentity;
      if (parsed?.mode === "guest" && typeof parsed.id === "string") return parsed;
    } catch {
      window.localStorage.removeItem(GUEST_KEY);
    }
  }
  const identity: GuestIdentity = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), mode: "guest" };
  window.localStorage.setItem(GUEST_KEY, JSON.stringify(identity));
  return identity;
}

export function clearGuestIdentity() {
  window.localStorage.removeItem(GUEST_KEY);
}
