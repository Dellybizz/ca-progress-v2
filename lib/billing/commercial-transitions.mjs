// Financial/access execution belongs to the renewal worker; publication only schedules.
export function priceDecreaseStatements(db,{planId,policyId,priceSubunits,actorId,reason,now}) {
  if(!Number.isSafeInteger(priceSubunits)||priceSubunits<100)throw new TypeError('Invalid published price');
  return [
    db.prepare("UPDATE subscription_policy_change_jobs SET state='superseded',updated_at=?1 WHERE kind='price_decrease' AND state IN ('pending','awaiting_approval') AND source_subscription_id IN (SELECT id FROM razorpay_subscriptions WHERE plan_id=?2) AND target_policy_id<>?3").bind(now,planId,policyId),
    db.prepare(`INSERT INTO subscription_policy_change_jobs(id,source_subscription_id,user_id,kind,target_policy_id,effective_at,target_price_subunits,approval_grace_days,state,reason,created_by,created_at,updated_at)
      SELECT 'price_decrease_'||s.id||'_'||?1,s.id,s.user_id,'price_decrease',?1,s.paid_through_at,?2,10,'pending',?3,?4,?5,?5
      FROM razorpay_subscriptions s WHERE s.plan_id=?6 AND s.financial_state='paid' AND s.paid_count>0
      AND s.status IN ('active','pending','halted','paused') AND s.cancel_at_period_end=0
      AND s.paid_through_at IS NOT NULL AND s.recurring_price_subunits>?2
      ON CONFLICT(source_subscription_id,kind,target_policy_id) DO NOTHING`).bind(policyId,priceSubunits,reason,actorId,now,planId),
  ];
}
