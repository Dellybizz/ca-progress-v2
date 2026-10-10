"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RecurringPlanOption, RecurringSubscriptionView } from "@/lib/billing/recurring-service";

export function SubscriptionControls({subscription,plans}:{subscription:RecurringSubscriptionView;plans:RecurringPlanOption[]}){
  const actionGuard=useRef(false);
  const router=useRouter(),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  useEffect(()=>{
    if(!["pending","halted","authenticated"].includes(subscription.status)&&!subscription.renewalEvidenceError)return;
    let stopped=false,count=0,timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    async function update(){
      if(stopped)return;
      if(document.hidden||actionGuard.current){if(!stopped&&++count<6)timer=setTimeout(()=>void update(),30000);return;}
      actionGuard.current=true;
      try{const response=await fetch("/api/v1/payments/subscription-action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscriptionId:subscription.providerSubscriptionId,action:"sync",requestId:crypto.randomUUID()}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});if(response.ok&&!stopped)router.refresh();}catch{/* Existing paid access stays visible while confirmation is unavailable. */}finally{actionGuard.current=false;}
      if(!stopped&&++count<6)timer=setTimeout(()=>void update(),30000);
    }
    timer=setTimeout(()=>void update(),10000);
    return()=>{stopped=true;controller.abort();clearTimeout(timer);};
  },[subscription.providerSubscriptionId,subscription.status,subscription.renewalEvidenceError,router]);
  async function run(action:string,targetPlanId?:string){if(actionGuard.current)return;if(action!=="sync"&&!window.confirm(action==="cancel_period_end"?"Stop automatic renewal? Your paid access continues until the end of your paid period.":action==="cancel_immediate"?"Cancel this subscription now?":action==="abandon_setup"?"Close this unpaid payment setup? You can start a new checkout afterwards.":action==="change_plan"?"Change your plan at the end of the current billing cycle?":action==="pause"?"Pause automatic payments? Paid access continues until your paid period ends.":"Resume automatic payments for this subscription?"))return;actionGuard.current=true;setBusy(action+(targetPlanId??""));setNotice(null);try{const response=await fetch("/api/v1/payments/subscription-action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscriptionId:subscription.providerSubscriptionId,action,targetPlanId,requestId:crypto.randomUUID()})});const result=await response.json() as{error?:string;reactivationRequiresCheckout?:boolean};if(!response.ok)throw new Error("We couldn’t update your subscription. Please try again shortly.");setNotice("Your subscription has been updated.");router.refresh();}catch(error){setNotice(error instanceof Error?error.message:"Subscription action failed.");}finally{actionGuard.current=false;setBusy(null);}}
  const terminal=["cancelled","completed","expired"].includes(subscription.status),paused=subscription.status==="paused";
  if(terminal)return <div className="phase11-renewal"><div><strong>Automatic renewal has ended.</strong><p>Start a new subscription when you are ready. Any remaining paid access is shown above.</p><Link className="ui-button ui-button--primary" href="/pricing">Start a new subscription</Link></div></div>;
  return <div id="manage-plan" style={{display:"grid",gap:10}}>{notice?<p role="status">{notice}</p>:null}<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <details><summary>More options</summary><button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("sync")}>{busy==="sync"?"Updating…":"Update payment status"}</button>
    {subscription.status==="active"?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("pause")}>{busy==="pause"?"Pausing…":"Pause automatic payments"}</button>:null}
    {paused?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("resume")}>{busy==="resume"?"Resuming…":"Resume"}</button>:null}
    </details>{!subscription.cancelAtPeriodEnd?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("cancel_period_end")}>{busy==="cancel_period_end"?"Scheduling…":"Cancel renewal"}</button>:<span>Your renewal is cancelled. Keep using your plan until your paid period ends.</span>}
    {subscription.status==="created"&&subscription.paidCount===0&&!subscription.paidThroughAt&&subscription.financialState==="unpaid"?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("abandon_setup")}>Start over with payment setup</button>:null}
    {subscription.canCancelImmediately?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("cancel_immediate")}>Cancel now</button>:null}
  </div>
  {subscription.status==="active"?<div><details><summary>Change plan</summary><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>{plans.filter(plan=>plan.id!==subscription.planId).map(plan=><button key={plan.id} className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("change_plan",plan.id)}>{subscription.scheduledTargetPlanId===plan.id?"Scheduled: ":"Switch to "}{plan.name} · {plan.billingCycle}</button>)}</div><small>Your new plan starts on your next payment date. Until then, keep using your current plan.</small></details></div>:null}
  </div>;
}
