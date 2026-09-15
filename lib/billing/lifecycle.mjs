function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nowTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  return Date.parse(String(value));
}

export function subscriptionAccessState(subscription, now = new Date()) {
  const nowMs = nowTimestamp(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("A valid current time is required.");

  const status = String(subscription?.status ?? "").trim().toLowerCase();
  const startsAtMs = timestamp(subscription?.starts_at);
  const endsAtMs = timestamp(subscription?.ends_at);
  const paidThrough = endsAtMs === null ? null : new Date(endsAtMs).toISOString();

  if (startsAtMs === null || startsAtMs > nowMs) {
    return { entitled: false, reason: "not_started", paidThrough };
  }

  if (status === "active") {
    if (endsAtMs !== null && endsAtMs <= nowMs) {
      return { entitled: false, reason: "term_ended", paidThrough };
    }
    return { entitled: true, reason: "active", paidThrough };
  }

  if (status === "cancelled") {
    if (endsAtMs !== null && endsAtMs > nowMs) {
      return { entitled: true, reason: "cancelled_paid_through", paidThrough };
    }
    return { entitled: false, reason: "cancelled_ended", paidThrough };
  }

  if (status === "paused") {
    if (endsAtMs !== null && endsAtMs > nowMs) {
      return { entitled: true, reason: "grace_period", paidThrough };
    }
    return { entitled: false, reason: "grace_ended", paidThrough };
  }

  return { entitled: false, reason: "inactive", paidThrough };
}

export function hasSubscriptionAccess(subscription, now = new Date()) {
  return subscriptionAccessState(subscription, now).entitled;
}
