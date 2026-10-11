import {maintainUpgradeRefunds} from '../../lib/billing/upgrade-refunds.mjs';
import {dependencies} from './payment-p2';
import {ensurePlan} from './p3';
import {paymentMethod} from '../../lib/billing/payment-quote.mjs';
import {mandateSchedule} from '../../lib/billing/mandate-schedule.mjs';
import {createCheckout,recoverCheckout,CheckoutError} from '../../lib/billing/checkout-engine.mjs';
import {acceptUpgrade,recoverUpgrade,ownedUpgrade,upgradeByOrder,verifyUpgradePayment,latestUpgrade,upgradeView,upgradeSnapshot,type Row} from '../../lib/billing/upgrade-engine.mjs';
type Env=Parameters<typeof dependencies>[0];
const stamp=()=>new Date().toISOString();
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
function deny(message:string,code:string,status=409):never{throw new CheckoutError(message,code,status);}
function deps(env:Env,user:string){return dependencies(env,user);}
async function signature(secret:string,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function equal(a:string,b:string){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
async function renewal(env:Env,user:string,id:string){
 const db=env.DB!,d=deps(env,user);await recoverUpgrade(db,user,id,d);
 let row=await ownedUpgrade(db,user,id);if(!row?.winning_payment_id||!row.source_cancelled_at)deny('Your upgrade payment and previous renewal are still being confirmed.','upgrade_renewal_pending',202);
 const s=upgradeSnapshot(row),q=s.quote,method=paymentMethod(s.renewalPaymentMethod??'upi');
 if(row.replacement_subscription_id){
  const prior=await d.provider(`subscriptions/${row.replacement_subscription_id}`),notes=prior.notes as Row|undefined;
  if(['cancelled','completed','expired'].includes(String(prior.status))&&Number(prior.paid_count)===0&&prior.id===row.replacement_subscription_id&&notes?.ca_progress_user_id===user&&notes?.checkout_key===row.replacement_request_id){
   const time=stamp();await db.batch([
    db.prepare("UPDATE razorpay_subscriptions SET status=?1,provider_verified=1,provider_state_json=?2,updated_at=?3 WHERE provider_subscription_id=?4 AND user_id=?5 AND paid_count=0 AND financial_state='unpaid'").bind(prior.status,JSON.stringify(prior),time,row.replacement_subscription_id,user),
    db.prepare("UPDATE subscription_upgrades SET replacement_subscription_id=NULL,replacement_request_id=?1,state='paid',updated_at=?2 WHERE purchase_group_id=?3 AND EXISTS(SELECT 1 FROM razorpay_subscriptions WHERE provider_subscription_id=?4 AND status IN ('cancelled','completed','expired') AND paid_count=0 AND financial_state='unpaid')").bind(crypto.randomUUID(),time,id,row.replacement_subscription_id)
   ]);row=(await ownedUpgrade(db,user,id))!;
  }
 }

 if(Date.parse(q.nextRenewalAt)<=Date.now()+60000)deny('This paid period has ended. Choose your next subscription from Pricing.','upgrade_period_ended');
 const policy=await db.prepare('SELECT pv.*,sp.tier_key,sp.billing_cycle FROM plan_policy_versions pv JOIN subscription_plans sp ON sp.id=pv.plan_id WHERE pv.id=?1 AND pv.plan_id=?2').bind(q.policyVersionId,row.plan_id).first<Row>();
 if(!policy||Number(policy.price_subunits)!==q.recurringPriceSubunits||policy.currency!==q.currency)deny('Your saved renewal terms need review.','upgrade_policy_mismatch');
 const open=await db.prepare("SELECT provider_subscription_id,checkout_key FROM razorpay_subscriptions WHERE user_id=?1 AND status IN ('created','authenticated','active','pending','halted','paused')").bind(user).all<Row>();
 if(open.results?.some(p=>p.checkout_key!==row!.replacement_request_id))deny('Another subscription needs review before approving renewals.','upgrade_existing_mandate');
 const prepare=async()=>{
  const terms={planId:String(row!.plan_id),tierKey:String(policy.tier_key),billingCycle:'monthly' as const,name:String(policy.name),policyVersionId:q.policyVersionId,recurringPrice:q.recurringPriceSubunits,currency:q.currency,durationValue:Number(policy.billing_duration_value),durationUnit:'month' as const,trialDays:0,graceDays:Number(policy.grace_days),introPrice:null,introCycles:0,introProviderOfferId:null,introOfferVerified:false,cancellationMode:'period_end' as const};
  const mapping=await ensurePlan(env,terms,'recurring',terms.recurringPrice),schedule=mandateSchedule(terms);
  return {contract:{...terms,discountCycles:0,providerTransportVersion:'manual-v1',paymentMethod:method,mandateScheduleVersion:schedule.scheduleVersion,providerPlanId:mapping.providerPlanId,initialAmount:terms.recurringPrice,totalCount:schedule.totalCount,providerOfferId:null,campaignClaimId:null},payload:{plan_id:mapping.providerPlanId,total_count:schedule.totalCount,quantity:1,customer_notify:true,start_at:Math.floor(Date.parse(q.nextRenewalAt)/1000),notes:{ca_progress_user_id:user,ca_progress_plan_id:terms.planId,ca_progress_policy_version_id:q.policyVersionId,checkout_key:String(row!.replacement_request_id)}}};
 };
 let checkout;
 try{checkout=await createCheckout(db,user,{requestId:String(row.replacement_request_id),planId:String(row.plan_id),policyVersionId:q.policyVersionId,paymentMethod:method,promoCode:''},{...d,preflight:undefined,prepare});}catch(error){
  const attempt=await db.prepare('SELECT state,provider_subscription_id FROM payment_checkout_attempts WHERE request_key=?1 AND user_id=?2').bind(row.replacement_request_id,user).first<Row>();
  if(attempt?.state==='failed'&&!attempt.provider_subscription_id)await db.prepare('UPDATE subscription_upgrades SET replacement_request_id=?1,updated_at=?2 WHERE purchase_group_id=?3 AND replacement_request_id=?4 AND replacement_subscription_id IS NULL').bind(crypto.randomUUID(),stamp(),id,row.replacement_request_id).run();
  throw error;
 }
 if(checkout.state==='failed'&&!checkout.subscriptionId){
  await db.prepare('UPDATE subscription_upgrades SET replacement_request_id=?1,last_error=?2,updated_at=?3 WHERE purchase_group_id=?4 AND replacement_request_id=?5 AND replacement_subscription_id IS NULL').bind(crypto.randomUUID(),checkout.errorCode??'renewal_creation_failed',stamp(),id,row.replacement_request_id).run();
  deny('Renewal setup could not start. Your paid access is safe; please try Continue setup again.','upgrade_renewal_retry');
 }
 if(checkout.subscriptionId){await db.prepare("UPDATE subscription_upgrades SET replacement_subscription_id=?1,state=CASE WHEN state='completed' THEN state ELSE 'renewal_ready' END,updated_at=?2 WHERE purchase_group_id=?3 AND source_cancelled_at IS NOT NULL").bind(checkout.subscriptionId,stamp(),id).run();}
 row=await ownedUpgrade(db,user,id);return {...await upgradeView(db,row!,d),checkout};
}
async function confirmRenewal(env:Env,user:string,id:string){
 const db=env.DB!,row=await ownedUpgrade(db,user,id);if(!row?.replacement_subscription_id)deny('Approve your future renewals first.','upgrade_renewal_missing');
 const attempt=await db.prepare('SELECT id FROM payment_checkout_attempts WHERE request_key=?1 AND user_id=?2').bind(row.replacement_request_id,user).first<Row>();
 if(!attempt)deny('Your renewal setup needs recovery.','upgrade_renewal_missing');
 const d=deps(env,user);await recoverCheckout(db,user,String(attempt.id),d);
 const sub=await d.provider(`subscriptions/${row.replacement_subscription_id}`),q=upgradeSnapshot(row).quote,notes=sub.notes as Row|undefined;
 if(sub.id!==row.replacement_subscription_id||notes?.ca_progress_user_id!==user||notes?.checkout_key!==row.replacement_request_id||Number(sub.start_at)!==Math.floor(Date.parse(q.nextRenewalAt)/1000)||!['authenticated','active'].includes(String(sub.status)))deny('Your bank approval is still being checked. Your paid access remains available.','upgrade_renewal_pending',202);
 await db.prepare("UPDATE subscription_upgrades SET state='completed',last_error=NULL,updated_at=?1 WHERE purchase_group_id=?2").bind(stamp(),id).run();
 return upgradeView(db,(await ownedUpgrade(db,user,id))!,d);
}
export async function upgradeFetch(request:Request,env:Env){
 if(request.headers.get('x-ca-progress-internal')!=='ca-progress-v2-web')return json({error:'Internal billing service only.'},403);
 const user=request.headers.get('x-ca-progress-user-id');if(!user)return json({error:'Sign in to manage your upgrade.'},401);
 if(!env.DB||!env.RAZORPAY_KEY_ID?.startsWith('rzp_live_'))return json({error:'Live upgrade payments are unavailable.'},503);
 try{
  if(request.method==='GET'){const latest=await latestUpgrade(env.DB,user);return json({upgrade:latest?await upgradeView(env.DB,(await ownedUpgrade(env.DB,user,latest.purchase_group_id))!,deps(env,user)):null});}
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  const raw=await request.text();if(raw.length>8192)return json({error:'Request is too large.'},413);
  const input=JSON.parse(raw) as {quoteId?:string;action?:string;razorpay_payment_id?:string;razorpay_order_id?:string;razorpay_signature?:string};
  if(!input.quoteId||!/^[a-f0-9-]{36}$/.test(input.quoteId))return json({error:'Invalid upgrade review.'},400);
  const d=deps(env,user);let upgrade;
  if(input.action==='pay')upgrade=await acceptUpgrade(env.DB,user,input.quoteId,d);
  else if(input.action==='recover')upgrade=await recoverUpgrade(env.DB,user,input.quoteId,d);
  else if(input.action==='renewal')return json(await renewal(env,user,input.quoteId));
  else if(input.action==='confirm_renewal')upgrade=await confirmRenewal(env,user,input.quoteId);
  else if(input.action==='verify'){
   const row=await ownedUpgrade(env.DB,user,input.quoteId);
   if(!row||row.provider_order_id!==input.razorpay_order_id||!/^pay_[A-Za-z0-9]+$/.test(input.razorpay_payment_id??'')||!equal(await signature(env.RAZORPAY_KEY_SECRET!,`${row.provider_order_id}|${input.razorpay_payment_id}`),input.razorpay_signature??''))return json({error:'Payment proof does not match your upgrade.'},400);
   upgrade=await verifyUpgradePayment(env.DB,row,input.razorpay_payment_id!,d);
  }else return json({error:'Unsupported upgrade action.'},400);
  return json({upgrade,userId:user});
 }catch(error){return json({error:error instanceof CheckoutError?error.message:'Your upgrade is saved and will be checked automatically.',code:error instanceof CheckoutError?error.code:'upgrade_pending'},error instanceof CheckoutError?error.status:503);}
}
export async function processUpgradeEvent(env:Env,payload:Row,sourceLocal:Row|null=null){
 const db=env.DB!,event=String(payload.event??''),data=payload.payload as {payment?:{entity?:Row};refund?:{entity?:Row};dispute?:{entity?:Row}}|undefined;
 const embedded=data?.payment?.entity,financial=event.startsWith('refund.')||event.startsWith('payment.dispute.');
 const paymentId=String(embedded?.id||data?.refund?.entity?.payment_id||data?.dispute?.entity?.payment_id||'');
 if(!paymentId)return false;
 let row=embedded?.order_id?await upgradeByOrder(db,String(embedded.order_id)):null;
 if(financial&&!row){const record=await db.prepare('SELECT u.user_id,u.purchase_group_id FROM subscription_upgrade_payments p JOIN subscription_upgrades u ON u.purchase_group_id=p.purchase_group_id WHERE p.payment_id=?1').bind(paymentId).first<Row>();if(record)row=await ownedUpgrade(db,String(record.user_id),String(record.purchase_group_id));}
 if(row){
  const d=deps(env,String(row.user_id));
  if(financial){
   const payment=await d.provider(`payments/${paymentId}`),record=await db.prepare('SELECT * FROM subscription_upgrade_payments WHERE payment_id=?1 AND purchase_group_id=?2').bind(paymentId,row.purchase_group_id).first<Row>();
   if(!record||payment.id!==paymentId||Number(payment.amount)!==Number(record.amount_subunits)||payment.currency!==record.currency)deny('Financial evidence needs review.','upgrade_financial_mismatch');
   let dispute='none';if(event.startsWith('payment.dispute.')){const entity=data?.dispute?.entity;if(!entity?.id)return false;const proof=await d.provider(`disputes/${entity.id}`);if(proof.id!==entity.id||proof.payment_id!==paymentId)deny('Dispute evidence needs review.','upgrade_financial_mismatch');dispute=String(proof.status??'review');}
   const refunded=Number(payment.amount_refunded??0),time=stamp();
   await db.prepare('UPDATE subscription_upgrade_payments SET amount_refunded=?1,dispute_state=?2,verified_at=?3 WHERE payment_id=?4').bind(refunded,dispute,time,paymentId).run();
   if(row.winning_payment_id===paymentId&&(refunded>0||dispute!=='none'))await db.batch([
    db.prepare("UPDATE subscription_purchase_groups SET state='review' WHERE id=?1").bind(row.purchase_group_id),
    db.prepare("UPDATE subscription_upgrades SET state='review',last_error='upgrade_financial_review',updated_at=?1 WHERE purchase_group_id=?2").bind(time,row.purchase_group_id),
    db.prepare("UPDATE user_subscriptions SET status='expired',ends_at=CASE WHEN ends_at>?1 THEN ?1 ELSE ends_at END,updated_at=?1 WHERE id=?2").bind(time,`upgrade_${row.purchase_group_id}`)
   ]);
  }else if(embedded?.status==='captured')await verifyUpgradePayment(db,row,paymentId,d);
  return true;
 }
 // A pre-debit already in flight can settle after cancellation of the old mandate.
 // Verify and refund that later Basic cycle instead of granting overlapping Basic time.
 if(!financial&&embedded?.status==='captured'&&sourceLocal){
  const upgrade=await db.prepare(`SELECT u.purchase_group_id,u.user_id,g.policy_snapshot_json FROM subscription_upgrades u JOIN subscription_purchase_groups g ON g.id=u.purchase_group_id WHERE u.source_subscription_id=?1 AND g.winning_payment_id IS NOT NULL AND u.activated_at IS NOT NULL LIMIT 1`).bind(sourceLocal.provider_subscription_id).first<Row>();
  if(!upgrade)return false;
  const d=deps(env,String(upgrade.user_id)),payment=await d.provider(`payments/${paymentId}`);
  if(!payment.invoice_id)return false;
  const invoice=await d.provider(`invoices/${payment.invoice_id}`),s=upgradeSnapshot(upgrade);
  if(paymentId===s.sourcePaymentId||Number(invoice.billing_start)*1000<Date.parse(s.sourcePeriodEnd))return false;
  if(!Number.isSafeInteger(Number(invoice.billing_start))||Number(invoice.billing_start)<=0||Number(invoice.billing_end)<=Number(invoice.billing_start)||invoice.subscription_id!==sourceLocal.provider_subscription_id||invoice.payment_id!==paymentId||payment.id!==paymentId||payment.status!=='captured'||invoice.status!=='paid'||Number(payment.amount)!==Number(sourceLocal.recurring_price_subunits)||Number(invoice.amount_paid)!==Number(payment.amount)||Number(invoice.amount_due)!==0||payment.currency!==sourceLocal.currency)deny('Late renewal needs review.','upgrade_late_renewal_mismatch');
  await db.prepare("INSERT OR IGNORE INTO subscription_refund_obligations(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES(?1,?2,?3,?4,'pending',?5)").bind(paymentId,upgrade.purchase_group_id,payment.amount,payment.currency,`late_renewal_${paymentId}`).run();
  await db.prepare(`INSERT OR IGNORE INTO subscription_upgrade_payments(payment_id,purchase_group_id,provider_order_id,amount_subunits,currency,status,provider_created_at,verified_at) VALUES(?1,?2,?3,?4,?5,'captured',?6,?7)`).bind(paymentId,upgrade.purchase_group_id,String(payment.order_id||invoice.order_id||invoice.id),payment.amount,payment.currency,new Date(Number(payment.created_at)*1000).toISOString(),stamp()).run();
  const originalEnd=s.sourcePeriodEnd,time=stamp();
  await db.prepare("UPDATE user_subscriptions SET ends_at=CASE WHEN ends_at>?1 THEN ?1 ELSE ends_at END,status=CASE WHEN ?1<=?2 THEN 'expired' ELSE status END,updated_at=?2 WHERE provider_subscription_id=?3 AND user_id=?4").bind(originalEnd,time,sourceLocal.provider_subscription_id,upgrade.user_id).run();
  return true;
 }
 return false;
}
export async function maintainUpgrades(env:Env){
 if(!env.DB)return;
 const list=await env.DB.prepare("SELECT purchase_group_id,user_id,state FROM subscription_upgrades WHERE state IN ('paid','renewal_ready','ready','uncertain','dispatching') OR (state='completed' AND datetime(updated_at)>datetime('now','-14 days')) ORDER BY COALESCE(last_checked_at,updated_at) LIMIT 30").all<Row>();
 await maintainUpgradeRefunds(env.DB,deps(env,''));
 for(const row of list.results??[]){try{if(['uncertain','dispatching'].includes(String(row.state)))await acceptUpgrade(env.DB,String(row.user_id),String(row.purchase_group_id),deps(env,String(row.user_id)));else await recoverUpgrade(env.DB,String(row.user_id),String(row.purchase_group_id),deps(env,String(row.user_id)));const full=await ownedUpgrade(env.DB,String(row.user_id),String(row.purchase_group_id));if(full?.winning_payment_id){const s=upgradeSnapshot(full),local=await env.DB.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(full.source_subscription_id,row.user_id).first<Row>();if(local){const late=await env.DB.prepare("SELECT provider_payment_id FROM payment_subscription_cycles WHERE provider_subscription_id=?1 AND starts_at>=?2 AND status='verified'").bind(full.source_subscription_id,s.sourcePeriodEnd).all<Row>();for(const payment of late.results??[])await processUpgradeEvent(env,{event:'subscription.charged',payload:{payment:{entity:{id:payment.provider_payment_id,status:'captured'}}}},local);}}
 if(row.state==='renewal_ready')await confirmRenewal(env,String(row.user_id),String(row.purchase_group_id));}catch(error){await env.DB.prepare('UPDATE subscription_upgrades SET last_error=?1,updated_at=?2 WHERE purchase_group_id=?3').bind(error instanceof CheckoutError?error.code:'upgrade_recovery_pending',stamp(),row.purchase_group_id).run();}finally{await env.DB.prepare('UPDATE subscription_upgrades SET last_checked_at=?1 WHERE purchase_group_id=?2').bind(stamp(),row.purchase_group_id).run();}}
}
