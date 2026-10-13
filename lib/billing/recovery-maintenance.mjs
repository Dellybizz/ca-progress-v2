export async function maintainRecovery(db, now = new Date().toISOString()) {
  const day = new Date(Date.parse(now) + 86400000).toISOString();
  const soon = new Date(Date.parse(now) + 3 * 86400000).toISOString();
  const writes = [
    db.prepare(`UPDATE billing_notifications SET suppressed_at=?1 WHERE suppressed_at IS NULL AND notification_type IN ('billing_payment_failed','billing_grace_ending','billing_grace_expired') AND EXISTS(SELECT 1 FROM razorpay_subscriptions s WHERE s.provider_subscription_id=billing_notifications.provider_subscription_id AND (s.cancel_at_period_end=1 OR EXISTS(SELECT 1 FROM subscription_cancel_intents c WHERE c.source_subscription_id=s.id AND c.reason='user_grace')))`).bind(now),
    db.prepare(`INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
      SELECT lower(hex(randomblob(16))),s.user_id,s.provider_subscription_id,s.failure_paid_through_at||':day:'||CAST(julianday(?1)-julianday(n.created_at) AS INTEGER),
      'billing_payment_failed','Renewal is still unpaid','Please complete your renewal. Your grace deadline remains unchanged; check Billing for recovery.',?1
      FROM razorpay_subscriptions s JOIN billing_notifications n ON n.provider_subscription_id=s.provider_subscription_id AND n.cycle_key=s.failure_paid_through_at AND n.notification_type='billing_payment_failed'
      WHERE s.failure_paid_through_at IS NOT NULL AND s.cancel_at_period_end=0 AND s.status IN ('active','pending','halted')
      AND NOT EXISTS(SELECT 1 FROM subscription_cancel_intents c WHERE c.source_subscription_id=s.id AND c.reason='user_grace') AND s.financial_state NOT IN ('refunded','disputed','mismatch') AND julianday(s.grace_until)>julianday(?1)
      AND julianday(?1)>=julianday(n.created_at)+1`).bind(now),

    db.prepare(`UPDATE billing_notifications SET suppressed_at=?1 WHERE suppressed_at IS NULL AND
      (notification_type='billing_renewal_due' AND julianday(cycle_key)<=julianday(?1)
      OR notification_type='billing_grace_ending' AND EXISTS(SELECT 1 FROM razorpay_subscriptions s WHERE s.provider_subscription_id=billing_notifications.provider_subscription_id AND julianday(s.grace_until)<=julianday(?1)))`).bind(now),
    db.prepare(`INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,event_type,source,starts_at,ends_at,metadata,created_at)
      SELECT lower(hex(randomblob(16))),id,user_id,plan_id,'expired','razorpay_subscription',starts_at,ends_at,'{"reason":"verified_access_boundary"}',?1
      FROM user_subscriptions WHERE provider_subscription_id IS NOT NULL AND ends_at IS NOT NULL AND julianday(ends_at)<=julianday(?1) AND status IN ('active','paused','cancelled')`).bind(now),
    db.prepare("UPDATE user_subscriptions SET status='expired',updated_at=?1 WHERE provider_subscription_id IS NOT NULL AND ends_at IS NOT NULL AND julianday(ends_at)<=julianday(?1) AND status IN ('active','paused','cancelled')").bind(now),
    db.prepare(`INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
      SELECT lower(hex(randomblob(16))),user_id,provider_subscription_id,charge_at,'billing_renewal_due','Renewal is approaching','Your authorized renewal is due within three days. Keep the linked account funded. Check Billing for its schedule.',?1
      FROM razorpay_subscriptions WHERE status='active' AND cancel_at_period_end=0 AND financial_state='paid' AND failure_paid_through_at IS NULL AND renewal_evidence_error IS NULL AND julianday(charge_at)>julianday(?1) AND julianday(charge_at)<=julianday(?2)`).bind(now,soon),
    db.prepare(`INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
      SELECT lower(hex(randomblob(16))),user_id,provider_subscription_id,failure_paid_through_at,'billing_grace_ending','Grace ends within 24 hours','Your fixed grace deadline is approaching. Open Billing to recover the unpaid renewal. Your saved data remains available.',?1
      FROM razorpay_subscriptions WHERE cancel_at_period_end=0 AND failure_paid_through_at IS NOT NULL AND financial_state NOT IN ('refunded','disputed','mismatch') AND julianday(grace_until)>julianday(?1) AND julianday(grace_until)<=julianday(?2)`).bind(now,day),
    db.prepare(`INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
      SELECT lower(hex(randomblob(16))),user_id,provider_subscription_id,failure_paid_through_at,'billing_grace_expired','Paid access has ended','Your verified paid period and any saved grace have ended. Free limits now apply. Saved data is preserved; open Billing for recovery.',?1
      FROM razorpay_subscriptions WHERE cancel_at_period_end=0 AND failure_paid_through_at IS NOT NULL AND financial_state NOT IN ('refunded','disputed','mismatch') AND julianday(COALESCE(grace_until,failure_paid_through_at))<=julianday(?1)`).bind(now),
  ];
  const results = await db.batch(writes);
  if (results.some(result => result.success === false)) throw new Error('Recovery maintenance could not be committed.');
}
