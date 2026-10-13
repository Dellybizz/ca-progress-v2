import {giftsFetch} from './gifts';
import {maintainGifts} from '../../lib/billing/gifts.mjs';
import {maintainGiftSources} from '../../lib/billing/gift-sources.mjs';
import {maintainStorageCleanup,type StorageDependencies} from '../../lib/billing/storage-cleanup.mjs';
import {storageAllowance} from '../../lib/billing/storage-allowance.mjs';
import {maintainStorageEmails,storageEmailSender,type StorageEmailEnv} from '../../lib/billing/storage-email.mjs';
import {maintainRequestedCancellations,maintainCollectionDeadlines,maintainCommercialChanges} from '../../lib/billing/collection-maintenance.mjs';
import {maintainUpgradeRefunds} from '../../lib/billing/upgrade-refunds.mjs';
import {maintainCheckoutRetries} from '../../lib/billing/checkout-retries.mjs';
import {maintainSubscriptionSwitches,maintainSwitchChargeRefunds} from '../../lib/billing/subscription-switch.mjs';
import {dependencies} from './payment-p2';
import {upgradeFetch,maintainUpgrades} from './upgrades';
import previous from './payment-p4';
import {maintainRecovery} from '../../lib/billing/recovery-maintenance.mjs';
type Env=Parameters<typeof previous.fetch>[1] & StorageEmailEnv & {USER_RESOURCES_R2?:NonNullable<StorageDependencies['bucket']>};
function storageDependencies(env:Env):StorageDependencies{return {bucket:env.USER_RESOURCES_R2,bucketName:'ca-progress-v2-staging-user-resources',async access(user){const response=await previous.fetch(new Request('https://billing.internal/entitlement?featureKey=resources.storage',{headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-ca-progress-user-id':user}}),env);if(!response.ok)throw new Error('storage_entitlement_unavailable');return storageAllowance(env.DB!,user,await response.json() as {planId:string;allowed:boolean});}};}
type BaseMessage=Parameters<typeof previous.queue>[0]['messages'][number];
type RetryMessage={body:{kind:'retry_maintenance';userId:string};ack():void;retry():void};
const worker = {
 async fetch(request:Request,env:Env){
  const giftResponse=await giftsFetch(request,env);if(giftResponse)return giftResponse;
  if(new URL(request.url).pathname==='/upgrade')return upgradeFetch(request,env);
  const body=['/verify-subscription','/subscription-action','/webhook'].includes(new URL(request.url).pathname)?await request.clone().json().catch(()=>null) as {razorpay_subscription_id?:string;subscriptionId?:string;payload?:{subscription?:{entity?:{id?:string}};payment?:{entity?:{subscription_id?:string}};invoice?:{entity?:{subscription_id?:string}}}}|null:null;
  let response=await previous.fetch(request,env);
  if(env.DB&&response.ok&&body){const subId=body.razorpay_subscription_id??body.subscriptionId??body.payload?.subscription?.entity?.id??body.payload?.payment?.entity?.subscription_id??body.payload?.invoice?.entity?.subscription_id;
   const gift=subId?await env.DB.prepare('SELECT g.recipient_user_id FROM recurring_gifts g JOIN razorpay_subscriptions s ON s.gift_id=g.id WHERE s.provider_subscription_id=?1').bind(subId).first<{recipient_user_id:string}>():null;
   if(gift)response=new Response(JSON.stringify({...await response.json() as object,beneficiaryUserId:gift.recipient_user_id}),{status:response.status,headers:response.headers});
  }
  const user=request.headers.get('x-ca-progress-user-id');
  if(env.DB&&user&&request.headers.get('x-ca-progress-internal')==='ca-progress-v2-web'&&['/verify-subscription','/subscription-action','/checkout/recover'].includes(new URL(request.url).pathname)){await maintainSubscriptionSwitches(env.DB,dependencies(env,user).provider,user);await maintainSwitchChargeRefunds(env.DB,dependencies(env,user).provider,user);await maintainGifts(env.DB,dependencies(env,user).provider);await maintainGiftSources(env.DB,dependencies(env,user).provider);await env.BILLING_OPS_QUEUE?.send({kind:'retry_maintenance',userId:user} as never).catch(()=>undefined);}
  if(request.headers.get('x-ca-progress-internal')==='ca-progress-v2-web'&&new URL(request.url).pathname==='/health'&&response.ok){
   return new Response(JSON.stringify({...await response.json() as object,phase:5,ownerRulesPhase:5,recoveryAfterGraceDays:7,recoveryReminders:'daily_in_app',graceAnchor:'verified_paid_through'}),{headers:response.headers});
  }
  return response;
 },
 async queue(batch:{messages:(BaseMessage|RetryMessage)[]},env:Env){
  const regular=batch.messages.filter((m):m is BaseMessage=>m.body.kind!=='retry_maintenance');
  if(regular.length)await previous.queue({messages:regular},env);
  for(const message of batch.messages){if(message.body.kind!=='retry_maintenance')continue;try{if(!env.DB)throw new Error('Billing database unavailable');await maintainCheckoutRetries(env.DB,dependencies(env,message.body.userId).provider,message.body.userId);message.ack();}catch{message.retry();}}
  if(env.DB&&regular.length){await maintainGifts(env.DB,dependencies(env,'').provider);await maintainGiftSources(env.DB,dependencies(env,'').provider);await maintainSubscriptionSwitches(env.DB,dependencies(env,'').provider);await maintainSwitchChargeRefunds(env.DB,dependencies(env,'').provider);await maintainCheckoutRetries(env.DB,dependencies(env,'').provider);}
 },
 async scheduled(controller:{scheduledTime:number},env:Env){
  if(!env.DB)throw new Error('Billing database is unavailable.');
  await maintainRecovery(env.DB);
  const deps=dependencies(env,'');
  await maintainRequestedCancellations(env.DB,deps.provider);
  await maintainCommercialChanges(env.DB,deps.provider,deps.reconcile!);
  await maintainCollectionDeadlines(env.DB,deps.provider,new Date().toISOString(),deps.reconcile!);
  await maintainUpgradeRefunds(env.DB,{provider:deps.provider},'subscription_cancellation_refunds');
  await maintainUpgrades(env).catch(()=>undefined);
  {await maintainSubscriptionSwitches(env.DB,dependencies(env,'').provider);await maintainSwitchChargeRefunds(env.DB,dependencies(env,'').provider);await maintainCheckoutRetries(env.DB,dependencies(env,'').provider);}
  await previous.scheduled(controller,env);
  await maintainRecovery(env.DB);
  await maintainGifts(env.DB,deps.provider);await maintainGiftSources(env.DB,deps.provider);
  if(env.USER_RESOURCES_R2){await maintainStorageCleanup(env.DB,storageDependencies(env));await maintainStorageEmails(env.DB,storageEmailSender(env),env.STORAGE_CLEANUP_EMAIL_FROM);}
 }
};

export default worker;
