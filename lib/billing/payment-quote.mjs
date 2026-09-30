// Introductory Subscription Offers in this release are UPI-only.
export function paymentMethod(value = "upi") {
  if (!["upi", "card", "emandate"].includes(value)) throw new Error("Choose UPI, Card or eMandate.");
  return value;
}
export function quoteForMethod({recurring, intro = null, eligible = false, trialDays = 0}, method) {
  paymentMethod(method);
  if (!Number.isSafeInteger(recurring) || recurring < 0 || (intro !== null && (!Number.isSafeInteger(intro) || intro < 100 || intro > recurring))) throw new Error("Invalid policy pricing.");
  const introApplied = method === "upi" && eligible && intro !== null;
  return {paymentMethod: method, firstChargeSubunits: introApplied ? intro : recurring, dueTodaySubunits: trialDays > 0 ? 0 : introApplied ? intro : recurring, recurringPriceSubunits: recurring, introApplied};
}
export function mappingMatches(policy, mapping) {
  return Boolean(mapping && mapping.state === "ready" && /^plan_[A-Za-z0-9]+$/.test(String(mapping.provider_plan_id)) && Number(mapping.amount_subunits) === Number(policy.price_subunits) && mapping.currency === policy.currency && mapping.period === (policy.billing_duration_unit === "year" ? "yearly" : "monthly") && Number(mapping.interval_value) === Number(policy.billing_duration_value));
}
