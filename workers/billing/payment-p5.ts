import {upgradeFetch,maintainUpgrades} from './upgrades';
import previous from './payment-p4';
import {maintainRecovery} from '../../lib/billing/recovery-maintenance.mjs';
type Env=Parameters<typeof previous.fetch>[1];
const worker = {
 async fetch(request:Request,env:Env){
  if(new URL(request.url).pathname==='/upgrade')return upgradeFetch(request,env);
  const response=await previous.fetch(request,env);
  if(request.headers.get('x-ca-progress-internal')==='ca-progress-v2-web'&&new URL(request.url).pathname==='/health'&&response.ok){
   return new Response(JSON.stringify({...await response.json() as object,phase:5,recoveryReminders:'in_app',graceAnchor:'verified_paid_through'}),{headers:response.headers});
  }
  return response;
 },
 queue:previous.queue,
 async scheduled(controller:{scheduledTime:number},env:Env){
  if(!env.DB)throw new Error('Billing database is unavailable.');
  await maintainRecovery(env.DB);
  await maintainUpgrades(env).catch(()=>undefined);
  await previous.scheduled(controller,env);
  await maintainRecovery(env.DB);
 }
};

export default worker;
