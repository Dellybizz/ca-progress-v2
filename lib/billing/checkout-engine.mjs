// Provider creation is deliberately never retried after a possibly dispatched request.
export const ACTIVE_STATES=Object.freeze(['reserved','preparing','dispatching','uncertain','provider_created','ready','pending']);
const stamp=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
const seconds=value=>Number(value)>0?new Date(Number(value)*1000).toISOString():null;
const TERMINAL=new Set(['cancelled','completed','expired']);
const known=new Set(['created','authenticated','active','pending','halted','paused',...TERMINAL]);
export class CheckoutError extends Error{constructor(message,code,status=409){super(message);this.code=code;this.status=status;}}
export function checkoutInput(value){
  const requestId=String(value?.requestId??'').trim(),planId=String(value?.planId??'').trim(),method=value?.paymentMethod??'upi',version=String(value?.policyVersionId??'').trim(),promoCode=String(value?.promoCode??'').trim().toUpperCase();
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)||!planId||planId.length>120||version.length>120||promoCode.length>80||!['upi','card','emandate'].includes(method))throw new CheckoutError('Checkout request is invalid.','invalid_checkout',400);
  return{requestId,planId,paymentMethod:method,policyVersionId:version,promoCode};
}
const fingerprint=input=>JSON.stringify([input.planId,input.paymentMethod,input.policyVersionId,input.promoCode]);
const owned=(db,user,id)=>db.prepare('SELECT * FROM payment_checkout_attempts WHERE id=?1 AND user_id=?2').bind(id,user).first();
const active=(db,user)=>db.prepare("SELECT * FROM payment_checkout_attempts WHERE user_id=?1 AND state IN ('reserved','preparing','dispatching','uncertain','provider_created','ready','pending') ORDER BY created_at DESC LIMIT 1").bind(user).first();
export async function reserveCheckout(db,userId,input){
  const now=stamp();
  await db.prepare("INSERT OR IGNORE INTO payment_checkout_attempts(id,request_key,user_id,fingerprint,input_json,state,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'reserved',?6,?6)").bind(uuid(),input.requestId,userId,fingerprint(input),JSON.stringify(input),now).run();
  const row=await db.prepare('SELECT * FROM payment_checkout_attempts WHERE request_key=?1 AND user_id=?2').bind(input.requestId,userId).first()??await active(db,userId);
  if(!row)throw new CheckoutError('This request key is unavailable.','request_key_unavailable');
  if(row.fingerprint!==fingerprint(input))throw new CheckoutError('An existing checkout keeps its original terms. Review it in Billing.','checkout_terms_conflict');
  return row;
}
export async function latestCheckout(db,userId,id){return id?owned(db,userId,id):await active(db,userId)??await db.prepare('SELECT * FROM payment_checkout_attempts WHERE user_id=?1 ORDER BY created_at DESC,id DESC LIMIT 1').bind(userId).first();}
async function lease(db,row,allowed){
  const token=uuid(),now=stamp();
  const result=await db.prepare(`UPDATE payment_checkout_attempts SET lease_token=?1,lease_until=?2,updated_at=?3 WHERE id=?4 AND state IN (${allowed.map(()=>'?').join(',')}) AND (lease_token IS NULL OR lease_until<?3)`).bind(token,new Date(Date.now()+300000).toISOString(),now,row.id,...allowed).run();
  return Number(result.meta?.changes)===1?token:null;
}
async function update(db,id,token,sql,values=[]){const result=await db.prepare(`UPDATE payment_checkout_attempts SET ${sql},updated_at=?1 WHERE id=?2 AND lease_token=?3`).bind(stamp(),id,token,...values).run();if(Number(result.meta?.changes)!==1)throw new CheckoutError('Checkout is being reconciled by another request.','checkout_lease_lost');}
async function release(db,id,token){await db.prepare('UPDATE payment_checkout_attempts SET lease_token=NULL,lease_until=NULL WHERE id=?1 AND lease_token=?2').bind(id,token).run();}
export function providerMatches(row,sub){
  const payload=JSON.parse(row.payload_json),notes=sub?.notes??{},expected=payload.notes??{};
  return Boolean(/^sub_[A-Za-z0-9]+$/.test(String(sub?.id))&&known.has(sub.status)&&sub.plan_id===payload.plan_id&&String(sub.offer_id??'')===String(payload.offer_id??'')&&notes.checkout_key===row.request_key&&notes.ca_progress_user_id===row.user_id&&notes.ca_progress_policy_version_id===expected.ca_progress_policy_version_id&&Number(sub.total_count)===Number(payload.total_count)&&Number(sub.quantity??1)===Number(payload.quantity??1)&&(!payload.start_at||Number(sub.start_at)===Number(payload.start_at)));
}
function safeProvider(sub){return Object.fromEntries(['id','plan_id','status','offer_id','current_start','current_end','ended_at','charge_at','start_at','total_count','paid_count','remaining_count','auth_attempts','created_at','quantity','notes','short_url'].filter(key=>sub[key]!==undefined).map(key=>[key,sub[key]]));}
async function attachProvider(db,row,token,sub){
  if(!providerMatches(row,sub))throw new CheckoutError('Provider subscription does not match the original checkout.','provider_checkout_mismatch');
  await update(db,row.id,token,"state='provider_created',provider_subscription_id=?4,provider_snapshot_json=?5,error_code=NULL",[sub.id,JSON.stringify(safeProvider(sub))]);
  return {...row,state:'provider_created',provider_subscription_id:sub.id,provider_snapshot_json:JSON.stringify(safeProvider(sub))};
}
async function project(db,row,token,sub){
  const c=JSON.parse(row.contract_json),now=stamp();
  const columns=['id','checkout_key','user_id','plan_id','policy_version_id','provider_subscription_id','provider_plan_id','recurring_provider_plan_id','status','financial_state','recurring_price_subunits','initial_price_subunits','currency','billing_cycle','billing_duration_value','billing_duration_unit','trial_days','grace_days','intro_billing_cycles','intro_remaining_cycles','cancellation_mode','total_count','paid_count','remaining_count','auth_attempts','start_at','current_start','current_end','charge_at','ended_at','provider_verified','provider_state_json','campaign_claim_id','provider_offer_id','created_at','updated_at','last_reconciled_at'];
  const values=[uuid(),row.request_key,row.user_id,c.planId,c.policyVersionId,sub.id,c.providerPlanId,c.providerPlanId,sub.status,'unpaid',c.recurringPrice,c.initialAmount,c.currency,c.billingCycle,c.durationValue,c.durationUnit,c.trialDays,c.graceDays,c.introCycles,c.introCycles,c.cancellationMode,c.totalCount,Number(sub.paid_count??0),sub.remaining_count??null,Number(sub.auth_attempts??0),seconds(sub.start_at),seconds(sub.current_start),seconds(sub.current_end),seconds(sub.charge_at),seconds(sub.ended_at),1,JSON.stringify(safeProvider(sub)),c.campaignClaimId??null,c.providerOfferId??null,now,now,now];
  const statements=[db.prepare(`INSERT OR IGNORE INTO razorpay_subscriptions(${columns.join(',')}) VALUES(${values.map((_,i)=>'?'+(i+1)).join(',')})`).bind(...values)];
  if(c.campaignClaimId)statements.push(db.prepare("UPDATE billing_campaign_claims SET state='applied',provider_subscription_id=?1,applied_at=?2 WHERE id=?3 AND state='reserved'").bind(sub.id,now,c.campaignClaimId));
  const results=await db.batch(statements);if(results.some(r=>r.success===false))throw new CheckoutError('Original checkout is awaiting local recovery.','checkout_projection_pending',503);
  const local=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(sub.id,row.user_id).first();
  if(!local||local.plan_id!==c.planId||local.policy_version_id!==c.policyVersionId||Number(local.initial_price_subunits)!==c.initialAmount||Number(local.recurring_price_subunits)!==c.recurringPrice)throw new CheckoutError('Original checkout requires reconciliation.','checkout_projection_mismatch');
  await update(db,row.id,token,"state=?4,error_code=NULL",[TERMINAL.has(sub.status)?'cancelled':'ready']);
}
export async function publicCheckout(db,row,keyId){
  if(!row)return null;
  const c=JSON.parse(row.contract_json),local=row.provider_subscription_id?await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(row.provider_subscription_id,row.user_id).first():null;
  let state=row.state,accessGranted=false;
  if(local){
    const access=await db.prepare("SELECT id FROM user_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2 AND starts_at<=?3 AND ends_at>?3 AND status IN ('active','cancelled','paused') LIMIT 1").bind(local.provider_subscription_id,row.user_id,stamp()).first();
    accessGranted=Boolean(access)&&local.financial_state!=='mismatch'&&local.financial_state!=='disputed'&&local.financial_state!=='refunded';
    if(accessGranted)state='succeeded';else if(TERMINAL.has(local.status))state='cancelled';else if(local.status!=='created'||local.financial_state==='mismatch')state='pending';
  }
  return{attemptId:row.id,requestId:row.request_key,state,subscriptionId:row.provider_subscription_id??null,keyId:keyId??null,planId:c.planId??JSON.parse(row.input_json).planId,policyVersionId:c.policyVersionId??JSON.parse(row.input_json).policyVersionId,paymentMethod:JSON.parse(row.input_json).paymentMethod,initialAmount:c.initialAmount??null,recurringAmount:c.recurringPrice??null,billingCycle:c.billingCycle??null,trialDays:c.trialDays??0,campaignApplied:Boolean(c.campaignClaimId),promoCode:c.promoCode??null,expectedCampaignPrice:c.expectedCampaignPrice??null,providerStatus:local?.status??null,accessGranted,resumable:Boolean(local&&['created','authenticated'].includes(local.status)&&local.financial_state!=='mismatch'),errorCode:row.error_code??null};
}
export async function createCheckout(db,userId,raw,deps){
  const input=checkoutInput(raw);let row=await reserveCheckout(db,userId,input);
  if(['dispatching','uncertain','provider_created','ready','pending','succeeded','cancelled'].includes(row.state))return recoverCheckout(db,userId,row.id,deps);
  if(row.state==='failed')return publicCheckout(db,row,deps.keyId);
  const token=await lease(db,row,['reserved','preparing']);if(!token)return publicCheckout(db,row,deps.keyId);
  let dispatched=false;
  try{
    await update(db,row.id,token,"state='preparing'");
    // Legacy unresolved mandates remain subject to the existing read-only safety gate.
    const legacy=await deps.preflight?.(input);
    if(legacy){if(!legacy.ok){const message=await legacy.json();throw new CheckoutError(message.error??'Existing subscription needs reconciliation.','legacy_checkout_conflict',legacy.status);}const reused=await legacy.json(),local=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(reused.subscriptionId,userId).first();if(!local)throw new CheckoutError('Original subscription cannot be restored.','legacy_checkout_missing');const c={planId:local.plan_id,policyVersionId:local.policy_version_id,initialAmount:Number(local.initial_price_subunits),recurringPrice:Number(local.recurring_price_subunits),billingCycle:local.billing_cycle,trialDays:Number(local.trial_days)};await update(db,row.id,token,"state='ready',provider_subscription_id=?4,contract_json=?5",[local.provider_subscription_id,JSON.stringify(c)]);return publicCheckout(db,await owned(db,userId,row.id),deps.keyId);}
    const prepared=await deps.prepare({...input,requestId:row.request_key},userId);
    await update(db,row.id,token,"state='dispatching',contract_json=?4,payload_json=?5",[JSON.stringify(prepared.contract),JSON.stringify(prepared.payload)]);
    row={...row,contract_json:JSON.stringify(prepared.contract),payload_json:JSON.stringify(prepared.payload)};dispatched=true;
    const sub=await deps.provider('subscriptions',{method:'POST',body:JSON.stringify(prepared.payload)});
    row=await attachProvider(db,row,token,sub);await project(db,row,token,sub);
    return publicCheckout(db,await owned(db,userId,row.id),deps.keyId);
  }catch(error){
    const latest=await owned(db,userId,row.id);
    const state=dispatched?(latest?.provider_subscription_id?'provider_created':error.definitiveRejection?'failed':'uncertain'):'failed';
    await update(db,row.id,token,'state=?4,error_code=?5',[state,error.code??(state==='uncertain'?'provider_response_uncertain':'checkout_not_created')]).catch(()=>undefined);
    if(!dispatched&&deps.releaseCampaign)await deps.releaseCampaign(userId,row.request_key).catch(()=>undefined);
    if(state==='failed'&&dispatched&&deps.releaseCampaign)await deps.releaseCampaign(userId,row.request_key).catch(()=>undefined);
    if(state==='uncertain'||state==='provider_created')return publicCheckout(db,await owned(db,userId,row.id),deps.keyId);
    throw error;
  }finally{await release(db,row.id,token);}
}
export async function recoverCheckout(db,userId,id,deps,candidateId){
  let row=await latestCheckout(db,userId,id);if(!row)throw new CheckoutError('Checkout attempt not found.','checkout_not_found',404);
  if(['failed','cancelled'].includes(row.state))return publicCheckout(db,row,deps.keyId);
  if(['reserved','preparing'].includes(row.state))return createCheckout(db,userId,JSON.parse(row.input_json),deps);
  const token=await lease(db,row,['dispatching','uncertain','provider_created','ready','pending','succeeded']);if(!token)return publicCheckout(db,row,deps.keyId);
  try{
    let sub;
    if(row.provider_subscription_id)sub=await deps.provider(`subscriptions/${encodeURIComponent(row.provider_subscription_id)}`);
    else if(candidateId)sub=await deps.provider(`subscriptions/${encodeURIComponent(candidateId)}`);
    else{
      const payload=JSON.parse(row.payload_json);if(!payload.plan_id)throw new CheckoutError('Checkout snapshot is unavailable.','checkout_snapshot_missing');
      const matches=[];let inventoryComplete=false;
      for(let page=0;page<5;page++){
        const list=await deps.provider(`subscriptions?plan_id=${encodeURIComponent(payload.plan_id)}&from=${Math.floor(Date.parse(row.created_at)/1000)-300}&count=100&skip=${page*100}`);
        if(!Array.isArray(list.items))throw new CheckoutError('Provider inventory could not be verified.','provider_inventory_unavailable');
        for(const item of list.items)if(item.notes?.checkout_key===row.request_key&&item.notes?.ca_progress_user_id===userId)matches.push(item);
        if(list.items.length<100){inventoryComplete=true;break;}
      }
      if(matches.length!==1||!inventoryComplete){await update(db,row.id,token,"state='uncertain',error_code=?4",[matches.length>1?'multiple_provider_matches':!inventoryComplete?'provider_inventory_incomplete':'provider_response_uncertain']);return publicCheckout(db,await owned(db,userId,row.id),deps.keyId);}
      sub=await deps.provider(`subscriptions/${encodeURIComponent(matches[0].id)}`);
    }
    // Legacy resumed subscriptions have no new provider payload; verify the original local identity instead.
    if(JSON.parse(row.payload_json).plan_id){if(!providerMatches(row,sub))throw new CheckoutError('Provider subscription does not match the original checkout.','provider_checkout_mismatch');const local=await db.prepare('SELECT id FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(sub.id,userId).first();if(!local){row=await attachProvider(db,row,token,sub);await project(db,row,token,sub);}else{const c=JSON.parse(row.contract_json),stored=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(sub.id,userId).first();if(stored.plan_id!==c.planId||stored.policy_version_id!==c.policyVersionId||Number(stored.initial_price_subunits)!==c.initialAmount||Number(stored.recurring_price_subunits)!==c.recurringPrice)throw new CheckoutError('Original checkout requires reconciliation.','checkout_projection_mismatch');}}
    else{const local=await db.prepare('SELECT provider_plan_id FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(sub.id,userId).first();if(!local||local.provider_plan_id!==sub.plan_id||!known.has(sub.status))throw new CheckoutError('Subscription identity mismatch.','provider_checkout_mismatch');}
    if(deps.reconcile)await deps.reconcile(sub.id,userId);
    const view=await publicCheckout(db,await owned(db,userId,row.id),deps.keyId);
    await update(db,row.id,token,'state=?4,error_code=NULL',[view.state]);
    return{...view,authorizationUrl:view.resumable?deps.authorizationUrl?.(sub.short_url)??null:null};
  }catch(error){await update(db,row.id,token,'error_code=?4',[error.code??'recovery_pending']).catch(()=>undefined);throw error;}finally{await release(db,row.id,token);}
}
