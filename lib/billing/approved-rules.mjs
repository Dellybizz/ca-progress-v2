// Owner decisions of 13 October 2026. Prices remain published admin configuration.
export const APPROVED_RULES_VERSION = '2026-10-13-v1';
export const APPROVED_RULES = Object.freeze({
  monthlyGraceDays: 3,
  annualGraceDays: 10,
  lowerPriceApprovalGraceDays: 10,
  recoveryAfterGraceDays: 7,
  storageWarningDays: 7,
  importantStorageExtraPercent: 10,
  checkoutQuoteMinutes: 30,
  duplicateRefundAlertHours: 24,
  introductoryScope: 'student_all_paid_plans',
  introductoryMonthlyOnly: true,
  giftsAtNormalPrice: true,
  normalFileOrder: 'least_recently_opened',
  importantFileOrder: 'largest_first',
  permanentCleanup: true,
});
const DAY = 86400000;
function instant(value) {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new TypeError('Invalid policy timestamp');
  return result;
}
export function graceDays(cycle, reason = 'renewal_failure') {
  if (!['monthly', 'annual'].includes(cycle)) throw new TypeError('Unsupported billing cycle');
  if (!['renewal_failure', 'lower_price_approval'].includes(reason)) throw new TypeError('Unsupported grace reason');
  return reason === 'lower_price_approval' ? APPROVED_RULES.lowerPriceApprovalGraceDays
    : cycle === 'annual' ? APPROVED_RULES.annualGraceDays : APPROVED_RULES.monthlyGraceDays;
}
export function recoveryWindow({paidThroughAt, cycle, now, cancelled = false}) {
  const anchor = instant(paidThroughAt), at = instant(now);
  const graceEnd = anchor + graceDays(cycle) * DAY;
  const recoveryEnd = graceEnd + APPROVED_RULES.recoveryAfterGraceDays * DAY;
  return {
    graceUntil: new Date(graceEnd).toISOString(),
    recoveryUntil: new Date(recoveryEnd).toISOString(),
    access: at < anchor || (!cancelled && at < graceEnd),
    recover: !cancelled && at >= anchor && at < recoveryEnd,
  };
}
export function quoteStillValid(createdAt, now) {
  const age = instant(now) - instant(createdAt);
  return age >= 0 && age < APPROVED_RULES.checkoutQuoteMinutes * 60000;
}
export function introductoryEligible({cycle, gifted = false, consumed = false}) {
  if (!['monthly', 'annual'].includes(cycle)) throw new TypeError('Unsupported billing cycle');
  return cycle === 'monthly' && !gifted && !consumed;
}
export function consumesIntroductoryOffer({verified, captured, discounted}) {
  // Refunds do not restore eligibility. Normal-price fallback does not consume it.
  return verified === true && captured === true && discounted === true;
}
export function latePaymentDecision({confirmedAt, periodEnd, cancelledDuringGrace = false}) {
  if (cancelledDuringGrace) return 'full_refund';
  return instant(confirmedAt) >= instant(periodEnd) ? 'retain_expired_period' : 'restore_original_period';
}
