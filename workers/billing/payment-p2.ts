import previous from "./payment-p1";
import {ensurePlan,resolveCommercial,requireIntroOffer} from "./p3";
import {reserveCampaign} from "./p4-final";
import {freezeUnsafeSubscriptionCreation,safeAuthorizationUrl} from "./p4-closure";
import {CheckoutError,createCheckout,recoverCheckout,latestCheckout,publicCheckout,type Dependencies} from "../../lib/billing/checkout-engine.mjs";
type Env=Parameters<typeof previous.fetch>[1];
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"private, no-store"}});
function dependencies(env:Env,userId:string):Dependencies{
  const db=env.DB!;
  return {
    keyId:env.RAZORPAY_KEY_ID,
    authorizationUrl:safeAuthorizationUrl,
    preflight:input=>freezeUnsafeSubscriptionCreation(new Request('https://billing.internal/create-subscription',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-ca-progress-user-id':userId,'content-type':'application/json'},body:JSON.stringify(input)}),env),
    async prepare(input){
      const resolved=await resolveCommercial(db,input.planId,userId);
      if(input.policyVersionId&&input.policyVersionId!==resolved.policyVersionId)throw new CheckoutError('Pricing changed. Refresh before checkout.','checkout_policy_changed');
      const terms=input.paymentMethod==='upi'?resolved:{...resolved,introPrice:null,introCycles:0,introProviderOfferId:null};
      if(input.promoCode&&(terms.introPrice!==null||input.paymentMethod!=='upi'))throw new CheckoutError('This offer cannot be combined with the selected checkout.','checkout_offer_conflict');
      const mapping=await ensurePlan(env,terms,'recurring',terms.recurringPrice);
      const campaign=input.paymentMethod==='upi'&&terms.introPrice===null?await reserveCampaign(db,{userId,planId:input.planId,requestId:input.requestId,policyVersionId:terms.policyVersionId,base:terms.recurringPrice,promoCode:input.promoCode}):null;
      const offerId=campaign?.campaign.providerOfferId??requireIntroOffer(terms);
      const totalCount=Math.max(1,Math.floor((terms.billingCycle==='monthly'?1200:100)/terms.durationValue));
      const contract={...terms,providerPlanId:mapping.providerPlanId,initialAmount:campaign?.final??terms.introPrice??terms.recurringPrice,totalCount,providerOfferId:offerId,campaignClaimId:campaign?.claimId??null,promoCode:campaign?.campaign.promoCode??null,expectedCampaignPrice:campaign?.final??null};
      const payload:Record<string,unknown>={plan_id:mapping.providerPlanId,total_count:totalCount,quantity:1,customer_notify:true,notes:{ca_progress_user_id:userId,ca_progress_plan_id:terms.planId,ca_progress_policy_version_id:terms.policyVersionId,checkout_key:input.requestId,...(campaign?{ca_progress_campaign_version_id:campaign.campaign.id}:{})}};
      if(offerId)payload.offer_id=offerId;
      const paid=await db.prepare("SELECT ends_at FROM user_subscriptions WHERE user_id=?1 AND ends_at>?2 AND status IN ('active','cancelled','paused') ORDER BY ends_at DESC LIMIT 1").bind(userId,new Date().toISOString()).first<{ends_at:string}>();
      const start=Math.max(terms.trialDays>0?Math.floor(Date.now()/1000+terms.trialDays*86400):0,paid?Math.floor(Date.parse(paid.ends_at)/1000):0);
      if(start>Math.floor(Date.now()/1000)+60)payload.start_at=start;
      return {contract,payload};
    },
    async provider(path,init={}){
      if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)throw new CheckoutError('Checkout is unavailable.','provider_not_configured',503);
      const response=await fetch(`https://api.razorpay.com/v1/${path}`,{...init,redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:`Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,'content-type':'application/json'}});
      if(!response.ok){const error=Object.assign(new CheckoutError('Provider request could not be completed.','provider_request_failed',502),{definitiveRejection:response.status>=400&&response.status<500&&![408,409,429].includes(response.status)});throw error;}
      return await response.json() as Record<string,unknown>;
    },
    async releaseCampaign(user,key){await db.prepare("UPDATE billing_campaign_claims SET state='failed',failed_at=?1 WHERE user_id=?2 AND claim_key=?3 AND state='reserved' AND provider_subscription_id IS NULL").bind(new Date().toISOString(),user,`checkout_${user}_${key}`.slice(0,160)).run();},
    async reconcile(subscriptionId,user){
      const response=await previous.fetch(new Request('https://billing.internal/subscription-action',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-ca-progress-user-id':user,'content-type':'application/json'},body:JSON.stringify({subscriptionId,action:'sync',requestId:crypto.randomUUID()})}),env);
      const result=await response.json() as {reconciliation?:{mismatch?:boolean}};
      if(!response.ok||result.reconciliation?.mismatch)throw new CheckoutError('Payment is awaiting verified reconciliation.','checkout_reconciliation_pending',503);
    },
  };
}
const worker={...previous,
  async fetch(request:Request,env:Env){
    const url=new URL(request.url),path=url.pathname;
    if(!['/create-subscription','/checkout/status','/checkout/recover'].includes(path))return previous.fetch(request,env);
    if(request.headers.get('x-ca-progress-internal')!=='ca-progress-v2-web')return json({error:'Internal billing service only.'},403);
    const user=request.headers.get('x-ca-progress-user-id');if(!user)return json({error:'Sign in to manage checkout.'},401);
    if(!env.DB)return json({error:'Billing is unavailable.'},503);
    try{
      const deps=dependencies(env,user);
      if(path==='/checkout/status'&&request.method==='GET')return json({checkout:await publicCheckout(env.DB,await latestCheckout(env.DB,user,url.searchParams.get('attemptId')||undefined),deps.keyId)});
      if(request.method!=='POST')return json({error:'Method not allowed.'},405);
      const raw=await request.text();if(raw.length>4096)return json({error:'Request is too large.'},413);
      let input:{attemptId?:string};try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();input=value;}catch{return json({error:'Invalid checkout request.'},400);}
      if(path==='/create-subscription'){
        const checkout=await createCheckout(env.DB,user,input,deps);
        if(checkout.state==='failed')return json({...checkout,error:'This attempt failed before subscription creation. Start a new checkout.'},409);
        return json(checkout,checkout.subscriptionId?200:202);
      }
      if(input.attemptId!==undefined&&(typeof input.attemptId!=='string'||input.attemptId.length>100))return json({error:'Invalid checkout identifier.'},400);
      return json({checkout:await recoverCheckout(env.DB,user,input.attemptId,deps),userId:user});
    }catch(error){return json({error:error instanceof CheckoutError?error.message:'Checkout could not be verified. Check its status in Billing.',code:error instanceof CheckoutError?error.code:'checkout_unavailable'},error instanceof CheckoutError?error.status:503);}
  },
  async queue(batch:Parameters<typeof previous.queue>[0],env:Env){
    for(const message of batch.messages){
      try{
        if(env.DB&&message.body.kind==='webhook'){
          const event=JSON.parse(message.body.raw) as {payload?:{subscription?:{entity?:{id?:string;notes?:Record<string,string>}}}};
          const sub=event.payload?.subscription?.entity,notes=sub?.notes;
          if(sub?.id&&notes?.checkout_key&&notes.ca_progress_user_id){
            const row=await env.DB.prepare("SELECT id FROM payment_checkout_attempts WHERE request_key=?1 AND user_id=?2 AND state IN ('dispatching','uncertain','provider_created')").bind(notes.checkout_key,notes.ca_progress_user_id).first<{id:string}>();
            if(row){await recoverCheckout(env.DB,notes.ca_progress_user_id,row.id,dependencies(env,notes.ca_progress_user_id),sub.id);const local=await env.DB.prepare('SELECT id FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(sub.id,notes.ca_progress_user_id).first();if(!local){message.retry();continue;}}
          }
        }
        await previous.queue({messages:[message]},env);
      }catch{message.retry();}
    }
  },
  async scheduled(controller:Parameters<typeof previous.scheduled>[0],env:Env){
    if(env.DB){const rows=await env.DB.prepare("SELECT id,user_id FROM payment_checkout_attempts WHERE state IN ('dispatching','uncertain','provider_created','ready','pending') AND (lease_until IS NULL OR lease_until<?1) ORDER BY updated_at LIMIT 5").bind(new Date().toISOString()).all<{id:string;user_id:string}>();for(const row of rows.results??[])await recoverCheckout(env.DB,row.user_id,row.id,dependencies(env,row.user_id)).catch(()=>undefined);}
    return previous.scheduled(controller,env);
  },
};
export default worker;
