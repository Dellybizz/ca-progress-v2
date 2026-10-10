import {providerFetch} from "./provider-http";
import {failurePolicy} from '../../lib/billing/failure-policy.mjs';
import {commitAccessProjection} from './access-projection';
import {collectRenewalEvidence,RenewalError} from '../../lib/billing/renewal-engine.mjs';
import type {Database} from '../../lib/billing/checkout-engine.mjs';
type Row=Record<string,unknown>;
type Env={DB?:Database;RAZORPAY_KEY_ID?:string;RAZORPAY_KEY_SECRET?:string};
export async function renewalEvidence(env:Env,local:Row,subscription:Row,payment:Row|null){
 if(!env.DB||!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)throw new RenewalError('Renewal verification is unavailable.');
 let contract=local;
 if(local.campaign_claim_id){const claim=await env.DB.prepare('SELECT discount_cycles,provider_offer_id FROM billing_campaign_claims WHERE id=?1').bind(local.campaign_claim_id).first<Row>();if(!claim||claim.provider_offer_id!==local.provider_offer_id)throw new RenewalError('Campaign offer identity changed.','renewal_contract_mismatch');contract={...local,discount_cycles:Number(claim.discount_cycles)};}
 if(['refunded','disputed'].includes(String(local.financial_state)))throw new RenewalError('Financial review is required before extending this subscription.','renewal_financial_hold');
 const result=await collectRenewalEvidence(env.DB,contract,subscription,async path=>{
  const response=await providerFetch(`https://api.razorpay.com/v1/${path}`,{method:'GET',headers:{authorization:`Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,accept:'application/json'}});
  if(!response.ok)throw new RenewalError('Provider renewal evidence could not be read.');return await response.json() as Row;
 },{keyId:env.RAZORPAY_KEY_ID,callbackPayment:payment});
 await env.DB.prepare('UPDATE razorpay_subscriptions SET renewal_evidence_error=NULL,provider_end_at=?1 WHERE id=?2').bind(Number(subscription.end_at)>0?new Date(Number(subscription.end_at)*1000).toISOString():null,local.id).run();
 return result;
}
export async function recordRenewalIssue(env:Env,local:Row,error:unknown,subscription?:Row,token?:string){
 const code=error instanceof RenewalError?error.code:'renewal_evidence_pending';
 const status=String(subscription?.status||local.status),failure=failurePolicy(local,status,local.paid_through_at?String(local.paid_through_at):null);
 // An unreadable new invoice cannot erase a grace contract already backed by
 // a captured prior period. This grants no new paid service dates.
 if(token&&failure.unresolved&&local.financial_state==='paid'&&local.provider_verified&&Number(local.paid_count)>0){
  const stamp=new Date().toISOString(),metadata=env.DB!.prepare('UPDATE razorpay_subscriptions SET status=?1,renewal_evidence_error=?2,grace_until=?3,updated_at=?4 WHERE id=?5').bind(status,code,failure.graceUntil,stamp,local.id);
  await commitAccessProjection(env.DB!,{local,token,metadata,planId:String(local.plan_id),policyId:String(local.policy_version_id),status:'paused',starts:local.current_start?String(local.current_start):local.start_at?String(local.start_at):null,ends:failure.accessEnd,paymentId:null,eventType:'reconcile.failure_evidence_pending',providerStatus:status});
  return {pending:true,mismatch:/mismatch/.test(code),reason:code,userId:String(local.user_id)};
 }
 const knownStatus=['created','authenticated','active','pending','halted','paused','cancelled','completed','expired'].includes(status)?status:String(local.status);
 await env.DB!.prepare('UPDATE razorpay_subscriptions SET status=?1,renewal_evidence_error=?2,updated_at=?3 WHERE id=?4').bind(knownStatus,code,new Date().toISOString(),local.id).run();
 return {pending:true,mismatch:/mismatch/.test(code),reason:code,userId:String(local.user_id)};
}
