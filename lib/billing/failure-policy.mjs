// Access follows captured invoice service dates; retries never move the grace anchor.
export function failurePolicy(local, status, paidThrough) {
  const previous = local.failure_paid_through_at || null;
  const recovered = previous && paidThrough && Date.parse(paidThrough) > Date.parse(previous);
  const eligible = !['refunded', 'disputed', 'mismatch'].includes(local.financial_state);
  const failing = eligible && ['pending', 'halted'].includes(status) && Boolean(paidThrough);
  const unresolved = eligible && previous && !recovered && ['active', 'pending', 'halted'].includes(status);
  const anchor = unresolved ? previous : failing ? paidThrough : null;
  const days = Number(local.grace_days || 0);
  const graceUntil = anchor && Number.isFinite(days) && days > 0
    ? new Date(Date.parse(anchor) + days * 86400000).toISOString() : null;
  return {anchor, graceUntil, accessEnd: graceUntil || paidThrough, unresolved: Boolean(anchor)};
}
export function retryGuidance(method, status) {
  if (status === 'halted') return 'Automatic retries have stopped. Follow the recovery instructions from Razorpay for this subscription, or contact billing support with the subscription reference.';
  if (method === 'emandate') return 'Bank confirmation can take more than 24 hours. Razorpay waits for the bank decision before another retry; do not make a duplicate payment while it is pending.';
  if (method === 'upi' || method === 'card') return 'Razorpay retries a failed debit on the following three days. Keep the linked account funded and follow any bank or Razorpay instructions.';
  return 'Razorpay manages retries according to the authorized payment method. Check its payment notification before taking action.';
}
