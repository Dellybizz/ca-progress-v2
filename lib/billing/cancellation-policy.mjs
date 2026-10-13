// A stopped grace renewal must not grant a later-arriving payment as a new purchase.
export async function enforceCancelledRenewal(db,local,evidence) {
 const intent=await db.prepare('SELECT * FROM subscription_cancel_intents WHERE source_subscription_id=?1').bind(local.id).first();
 if(!intent)return evidence;
 const prior=intent.reason==='user_grace'?null:await db.prepare("SELECT MAX(ends_at) boundary FROM payment_subscription_cycles WHERE razorpay_subscription_id=?1 AND status='verified' AND julianday(ends_at)>julianday(?2) AND julianday(verified_at)<julianday(?3)").bind(local.id,intent.boundary_at,intent.requested_at).first();
 if(prior?.boundary){const count=await db.prepare("SELECT COUNT(*) n FROM payment_subscription_cycles WHERE razorpay_subscription_id=?1 AND status='verified' AND julianday(ends_at)<=julianday(?2)").bind(local.id,prior.boundary).first();intent.boundary_at=prior.boundary;intent.paid_count_before=count.n;await db.batch([db.prepare('UPDATE subscription_cancel_intents SET boundary_at=?1,paid_count_before=?2 WHERE source_subscription_id=?3').bind(intent.boundary_at,intent.paid_count_before,local.id),db.prepare("UPDATE subscription_policy_change_jobs SET effective_at=?1 WHERE source_subscription_id=?2 AND state IN ('pending','awaiting_approval')").bind(intent.boundary_at,local.id)]);}
 const cycles=await db.prepare("SELECT * FROM payment_subscription_cycles WHERE razorpay_subscription_id=?1 AND status='verified' AND julianday(starts_at)>=julianday(?2)").bind(local.id,intent.boundary_at).all();
 if((cycles.results??[]).length)await db.batch(cycles.results.map(c=>db.prepare("INSERT INTO subscription_cancellation_refunds(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES(?1,?2,?3,?4,'pending',?5) ON CONFLICT(payment_id) DO NOTHING").bind(c.provider_payment_id,local.id,c.amount_subunits,c.currency,'cancelled_renewal_'+c.provider_payment_id)));
 return {...evidence,paidCount:Number(intent.paid_count_before),paidThrough:Number(intent.paid_count_before)>0?intent.boundary_at:null,latestPaidStart:intent.paid_start_before,forcePaidBoundary:true,firstCycleVerified:Number(intent.paid_count_before)>0};
}
export async function commercialGraceUntil(db,local,paidThrough,now=new Date().toISOString()) {
 if(['refunded','disputed','mismatch'].includes(local.financial_state)||!paidThrough)return null;
 const row=await db.prepare("SELECT j.* FROM subscription_policy_change_jobs j WHERE j.source_subscription_id=?1 AND j.kind='price_decrease' AND j.state IN ('pending','awaiting_approval') AND NOT EXISTS(SELECT 1 FROM subscription_cancel_intents c WHERE c.source_subscription_id=j.source_subscription_id AND c.reason='user_grace') ORDER BY j.created_at DESC LIMIT 1").bind(local.id).first();
 if(!row||row.effective_at!==paidThrough)return null;
 const until=new Date(Date.parse(row.effective_at)+Number(row.approval_grace_days)*86400000).toISOString();
 return Date.parse(until)>Date.parse(now)?until:null;
}
export async function cancellationRefundEvent(db,provider,payload,local,paymentId) {
 if(!local||!String(payload.event??'').startsWith('refund.')||!paymentId)return false;
 const obligation=await db.prepare('SELECT * FROM subscription_cancellation_refunds WHERE payment_id=?1 AND purchase_group_id=?2').bind(paymentId,local.id).first();
 if(!obligation)return false;
 const id=payload.payload?.refund?.entity?.id;
 if(!/^rfnd_[A-Za-z0-9]+$/.test(String(id)))throw new Error('cancellation_refund_reference_pending');
 const [refund,payment]=await Promise.all([provider('refunds/'+id),provider('payments/'+paymentId)]);
 if(refund.id!==id||refund.payment_id!==paymentId||Number(refund.amount)!==Number(obligation.amount_subunits)||refund.notes?.ca_progress_refund_request!==obligation.request_key||payment.id!==paymentId||payment.status!=='captured'||payment.subscription_id!==local.provider_subscription_id||payment.currency!==obligation.currency||Number(payment.amount)!==Number(obligation.amount_subunits))throw new Error('cancellation_refund_identity_mismatch');
 const state=refund.status==='processed'?'processed':refund.status==='failed'?'failed':'requested',now=new Date().toISOString();
 const writes=[db.prepare('UPDATE subscription_cancellation_refunds SET state=?1,provider_refund_id=?2,last_error=?3 WHERE payment_id=?4').bind(state,id,state==='failed'?'provider_refund_failed':null,paymentId)];
 if(state==='processed')writes.push(db.prepare("UPDATE payment_subscription_cycles SET status='refunded',updated_at=?1 WHERE provider_payment_id=?2").bind(now,paymentId),db.prepare("UPDATE razorpay_subscription_charges SET refund_state='full',updated_at=?1 WHERE provider_payment_id=?2").bind(now,paymentId));
 await db.batch(writes);
 return true;
}
