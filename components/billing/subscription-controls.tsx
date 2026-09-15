"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RecurringPlanOption, RecurringSubscriptionView } from "@/lib/billing/recurring-service";

export function SubscriptionControls({subscription,plans}:{subscription:RecurringSubscriptionView;plans:RecurringPlanOption[]}){
  const router=useRouter(),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  async function run(action:string,targetPlanId?:string){setBusy(action+(targetPlanId??""));setNotice(null);try{const response=await fetch("/api/payments/subscription-action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscriptionId:subscription.providerSubscriptionId,action,targetPlanId,requestId:crypto.randomUUID()})});const result=await response.json() as{error?:string;reactivationRequiresCheckout?:boolean};if(!response.ok)throw new Error(result.error||"Subscription action failed.");setNotice("Subscription state reconciled with Razorpay.");router.refresh();}catch(error){setNotice(error instanceof Error?error.message:"Subscription action failed.");}finally{setBusy(null);}}
  const terminal=["cancelled","completed","expired"].includes(subscription.status),paused=subscription.status==="paused";
  if(terminal)return <div className="phase11-renewal"><div><strong>This provider subscription is closed.</strong><p>Razorpay does not restart cancelled subscriptions. Reactivation creates a new verified subscription and mandate.</p><Link className="ui-button ui-button--primary" href="/pricing">Start a new subscription</Link></div></div>;
  return <div style={{display:"grid",gap:10}}>{notice?<p role="status">{notice}</p>:null}<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("sync")}>{busy==="sync"?"Syncing…":"Refresh from Razorpay"}</button>
    {subscription.status==="active"?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("pause")}>{busy==="pause"?"Pausing…":"Pause now"}</button>:null}
    {paused?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("resume")}>{busy==="resume"?"Resuming…":"Resume"}</button>:null}
    {!subscription.cancelAtPeriodEnd?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("cancel_period_end")}>{busy==="cancel_period_end"?"Scheduling…":"Cancel at period end"}</button>:<span>Cancellation is scheduled for the paid-through period end.</span>}
    {subscription.canCancelImmediately?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("cancel_immediate")}>Cancel now</button>:null}
  </div>
  {subscription.status==="active"?<div><strong>Change paid plan at cycle end</strong><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>{plans.filter(plan=>plan.id!==subscription.planId).map(plan=><button key={plan.id} className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>void run("change_plan",plan.id)}>{subscription.scheduledTargetPlanId===plan.id?"Scheduled: ":"Switch to "}{plan.name} · {plan.billingCycle}</button>)}</div><small>No P3 proration: the verified provider change takes effect at the current billing-cycle end.</small></div>:null}
  </div>;
}
