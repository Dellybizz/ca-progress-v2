export async function maintainRecovery(db, now = new Date().toISOString()) {
  const day = new Date(Date.parse(now) + 86400000).toISOString();
  const soon = new Date(Date.parse(now) + 3 * 86400000).toISOString();
  const writes = [
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
      FROM razorpay_subscriptions WHERE failure_paid_through_at IS NOT NULL AND financial_state NOT IN ('refunded','disputed','mismatch') AND julianday(grace_until)>julianday(?1) AND julianday(grace_until)<=julianday(?2)`).bind(now,day),
    db.prepare(`INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
      SELECT lower(hex(randomblob(16))),user_id,provider_subscription_id,failure_paid_through_at,'billing_grace_expired','Paid access has ended','Your verified paid period and any saved grace have ended. Free limits now apply. Saved data is preserved; open Billing for recovery.',?1
      FROM razorpay_subscriptions WHERE failure_paid_through_at IS NOT NULL AND financial_state NOT IN ('refunded','disputed','mismatch') AND julianday(COALESCE(grace_until,failure_paid_through_at))<=julianday(?1)`).bind(now),
  ];
  const results = await db.batch(writes);
  if (results.some(result => result.success === false)) throw new Error('Recovery maintenance could not be committed.');
}
