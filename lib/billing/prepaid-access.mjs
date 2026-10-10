// Access grants, trials and grace are not evidence that service was prepaid.
export const PREPAID_ACCESS_SQL=`SELECT MAX(ends_at) ends_at FROM (
 SELECT paid_through_at ends_at FROM razorpay_subscriptions
 WHERE user_id=?1 AND provider_verified=1 AND financial_state='paid' AND paid_count>0 AND paid_through_at>?2
 UNION ALL
 SELECT us.ends_at FROM user_subscriptions us JOIN payment_orders po
 ON po.provider_order_id=us.source_order_id AND po.user_id=us.user_id AND po.provider_payment_id=us.source_payment_id
 WHERE us.user_id=?1 AND us.source='razorpay' AND us.status IN ('active','cancelled','paused') AND us.ends_at>?2 AND po.status='paid'
 AND EXISTS (SELECT 1 FROM payment_events pe WHERE pe.payment_order_id=po.id AND pe.verified=1 AND pe.provider_status='captured' AND pe.provider_payment_id=po.provider_payment_id)
)`;
export async function prepaidAccess(db,userId,now=new Date().toISOString()){
 return db.prepare(PREPAID_ACCESS_SQL).bind(userId,now).first();
}
