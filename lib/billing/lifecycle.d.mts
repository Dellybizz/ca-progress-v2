export type SubscriptionAccessReason =
  | "active"
  | "not_started"
  | "term_ended"
  | "cancelled_paid_through"
  | "cancelled_ended"
  | "grace_period"
  | "grace_ended"
  | "inactive";

export type SubscriptionLifecycleLike = {
  status?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
} | null | undefined;

export type SubscriptionAccessState = {
  entitled: boolean;
  reason: SubscriptionAccessReason;
  paidThrough: string | null;
};

export function subscriptionAccessState(
  subscription: SubscriptionLifecycleLike,
  now?: Date | string | number,
): SubscriptionAccessState;

export function hasSubscriptionAccess(
  subscription: SubscriptionLifecycleLike,
  now?: Date | string | number,
): boolean;
