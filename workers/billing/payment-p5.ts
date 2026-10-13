import {maintainRequestedCancellations,maintainCollectionDeadlines,maintainCommercialChanges} from '../../lib/billing/collection-maintenance.mjs';
import {maintainUpgradeRefunds} from '../../lib/billing/upgrade-refunds.mjs';
import {maintainCheckoutRetries} from '../../lib/billing/checkout-retries.mjs';
import {maintainSubscriptionSwitches,maintainSwitchChargeRefunds} from '../../lib/billing/subscription-switch.mjs';
import {dependencies} from './payment-p2';
import {upgradeFetch,maintainUpgrades} from './upgrades';
import previous from './payment-p4';
import {maintainRecovery} from '../../lib/billing/recovery-maintenance.mjs';
type Env=Parameters<typeof previous.fetch>[1];
type BaseMessage=Parameters<typeof previous.queue>[0]['messages'][number];
type RetryMessage={body:{kind:'retry_maintenance';userId:string};ack():void;retry():void};
const worker = {
 async fetch(request:Request,env:Env){
  if(new URL(request.url).pathname==='/upgrade')return upgradeFetch(request,env);
  const response=await previous.fetch(request,env);
  const user=request.headers.get('x-ca-progress-user-id');
  if(env.DB&&user&&request.headers.get('x-ca-progress-internal')==='ca-progress-v2-web'&&['/verify-subscription','/subscription-action','/checkout/recover'].includes(new URL(request.url).pathname)){await maintainSubscriptionSwitches(env.DB,dependencies(env,user).provider,user);await maintainSwitchChargeRefunds(env.DB,dependencies(env,user).provider,user);await env.BILLING_OPS_QUEUE?.send({kind:'retry_maintenance',userId:user} as never).catch(()=>undefined);}
  if(request.headers.get('x-ca-progress-internal')==='ca-progress-v2-web'&&new URL(request.url).pathname==='/health'&&response.ok){
   return new Response(JSON.stringify({...await response.json() as object,phase:5,ownerRulesPhase:3,recoveryAfterGraceDays:7,recoveryReminders:'daily_in_app',graceAnchor:'verified_paid_through'}),{headers:response.headers});
  }
  return response;
 },
 async queue(batch:{messages:(BaseMessage|RetryMessage)[]},env:Env){
  const regular=batch.messages.filter((m):m is BaseMessage=>m.body.kind!=='retry_maintenance');
  if(regular.length)await previous.queue({messages:regular},env);
  for(const message of batch.messages){if(message.body.kind!=='retry_maintenance')continue;try{if(!env.DB)throw new Error('Billing database unavailable');await maintainCheckoutRetries(env.DB,dependencies(env,message.body.userId).provider,message.body.userId);message.ack();}catch{message.retry();}}
  if(env.DB&&regular.length){await maintainSubscriptionSwitches(env.DB,dependencies(env,'').provider);await maintainSwitchChargeRefunds(env.DB,dependencies(env,'').provider);await maintainCheckoutRetries(env.DB,dependencies(env,'').provider);}
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
 }
};

export default worker;
