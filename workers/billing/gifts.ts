import {offerGift,acceptGift,cancelGift} from '../../lib/billing/gifts.mjs';
import {reverseScheduledSwitch} from '../../lib/billing/subscription-switch.mjs';
import {dependencies} from './payment-p2';
import type previous from './payment-p4';
type Env=Parameters<typeof previous.fetch>[1];
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
export async function giftsFetch(request:Request,env:Env):Promise<Response|null>{
 const path=new URL(request.url).pathname;if(!path.startsWith('/gifts')&&path!=='/subscription-action')return null;
 if(request.headers.get('x-ca-progress-internal')!=='ca-progress-v2-web')return json({error:'Internal billing service only.'},403);
 const actor=request.headers.get('x-ca-progress-user-id');if(!actor)return json({error:'Sign in to manage gifts.'},401);if(!env.DB)return json({error:'Billing unavailable.'},503);
 try{
 if(path==='/gifts'&&request.method==='GET'){
  const rows=await env.DB.prepare(`SELECT g.*,p.name,p.billing_cycle,p.price_subunits,s.status provider_status,s.paid_through_at,s.cancel_at_period_end,s.recurring_price_subunits,
 (SELECT username FROM account_usernames WHERE user_id=g.purchaser_user_id) purchaser_username,(SELECT username FROM account_usernames WHERE user_id=g.recipient_user_id) recipient_username,
 (SELECT j.id FROM subscription_policy_change_jobs j JOIN razorpay_subscriptions original ON original.id=j.source_subscription_id WHERE original.gift_id=g.id AND j.kind='price_decrease' AND j.state='awaiting_approval' ORDER BY j.created_at DESC LIMIT 1) price_change_id,
 (SELECT j.target_policy_id FROM subscription_policy_change_jobs j JOIN razorpay_subscriptions original ON original.id=j.source_subscription_id WHERE original.gift_id=g.id AND j.kind='price_decrease' AND j.state='awaiting_approval' ORDER BY j.created_at DESC LIMIT 1) approval_policy_id,
 (SELECT j.target_price_subunits FROM subscription_policy_change_jobs j JOIN razorpay_subscriptions original ON original.id=j.source_subscription_id WHERE original.gift_id=g.id AND j.kind='price_decrease' AND j.state='awaiting_approval' ORDER BY j.created_at DESC LIMIT 1) approval_price_subunits
 FROM recurring_gifts g JOIN subscription_plans p ON p.id=g.plan_id LEFT JOIN razorpay_subscriptions s ON s.provider_subscription_id=g.provider_subscription_id WHERE g.purchaser_user_id=?1 OR g.recipient_user_id=?1 ORDER BY g.created_at DESC LIMIT 100`).bind(actor).all<Record<string,unknown>>();
  return json({gifts:(rows.results??[]).map(g=>({id:g.id,role:g.purchaser_user_id===actor?'purchaser':'recipient',purchaserUsername:g.purchaser_username,recipientUsername:g.recipient_username,planId:g.plan_id,planName:g.name,billingCycle:g.billing_cycle,normalPriceSubunits:g.price_subunits,renewalPriceSubunits:g.recurring_price_subunits??g.price_subunits,state:g.state,providerStatus:g.provider_status??null,paidThroughAt:g.paid_through_at??null,cancelAtPeriodEnd:Boolean(g.cancel_at_period_end),approvalPolicyId:g.purchaser_user_id===actor?g.approval_policy_id??null:null,approvalPriceSubunits:g.purchaser_user_id===actor?g.approval_price_subunits??null:null,priceChangeId:g.purchaser_user_id===actor?g.price_change_id??null:null}))});
 }
 if(request.method!=='POST')return path.startsWith('/gifts')?json({error:'Method not allowed.'},405):null;
 const raw=await request.clone().text();if(raw.length>4096)return json({error:'Request too large.'},413);const body=JSON.parse(raw);
 if(path==='/gifts/offer')return json({gift:await offerGift(env.DB,actor,body)});
 if(path==='/gifts/accept')return json({gift:await acceptGift(env.DB,actor,String(body.giftId??''))});
 if(path==='/gifts/cancel')return json(await cancelGift(env.DB,dependencies(env,actor).provider,actor,String(body.giftId??'')));
 if(path==='/subscription-action'){
  const local=await env.DB.prepare('SELECT s.*,g.recipient_user_id,g.purchaser_user_id FROM razorpay_subscriptions s JOIN recurring_gifts g ON g.id=s.gift_id WHERE s.provider_subscription_id=?1 AND (g.recipient_user_id=?2 OR g.purchaser_user_id=?2)').bind(body.subscriptionId,actor).first<Record<string,unknown>>();if(!local)return null;
  if(body.action==='abandon_setup'&&actor===local.purchaser_user_id)return null;
  if(['cancel_period_end','cancel_immediate','abandon_setup'].includes(body.action))return json(await cancelGift(env.DB,dependencies(env,actor).provider,actor,String(local.gift_id)));
  if(body.action==='change_plan'&&actor===local.recipient_user_id&&body.targetPlanId===local.plan_id){if(await reverseScheduledSwitch(env.DB,dependencies(env,actor).provider,actor,String(local.provider_subscription_id)))return json({ok:true,userId:actor});}
  if(body.action!=='sync')return json({error:'Manage gifted renewal from Gifts.'},409);
  if(actor!==local.purchaser_user_id){const headers=new Headers(request.headers);headers.set('x-ca-progress-user-id',String(local.purchaser_user_id));const p4=(await import('./payment-p4')).default;const response=await p4.fetch(new Request(request.url,{method:'POST',headers,body:raw}),env);return response.ok?json({...await response.json() as object,beneficiaryUserId:local.recipient_user_id}):response;}
 }
 return null;
 }catch(error){return json({error:error instanceof Error?error.message:'Gift update is pending.',code:(error as {code?:string}).code??'gift_pending'},(error as {status?:number}).status??409);}
}
