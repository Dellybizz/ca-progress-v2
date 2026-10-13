"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RecurringSubscriptionView } from "@/lib/billing/recurring-service";

export function SubscriptionControls({subscription}:{subscription:RecurringSubscriptionView}){
  const actionGuard=useRef(false);
  const dialog=useRef<HTMLDialogElement>(null),keepButton=useRef<HTMLButtonElement>(null);
  const [pendingAction,setPendingAction]=useState<"cancel_period_end"|"cancel_immediate"|"abandon_setup"|null>(null);
  useEffect(()=>{if(pendingAction&&!dialog.current?.open){dialog.current?.showModal();keepButton.current?.focus();}},[pendingAction]);
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
  async function run(action:"cancel_period_end"|"cancel_immediate"|"abandon_setup"){if(actionGuard.current)return;actionGuard.current=true;setBusy(action);setNotice(null);try{const response=await fetch("/api/v1/payments/subscription-action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscriptionId:subscription.providerSubscriptionId,action,requestId:crypto.randomUUID()})});if(!response.ok)throw new Error("We couldn’t update your subscription. Please try again shortly.");const result=await response.json();setNotice(result.cancellationPending?"Your grace access has ended. AutoPay cancellation is being confirmed; any late renewal charge will be refunded.":"Your subscription has been cancelled.");setPendingAction(null);router.refresh();}catch{setNotice("We couldn’t update your subscription. Please try again shortly.");}finally{actionGuard.current=false;setBusy(null);}}
  const terminal=["cancelled","completed","expired"].includes(subscription.status);
  if(terminal)return <div className="phase11-renewal"><div><strong>Automatic renewal has ended.</strong><p>Start a new subscription when you are ready. Any remaining paid access is shown above.</p><Link className="ui-button ui-button--primary" href="/pricing">Start a new subscription</Link></div></div>;
  return <div id="manage-plan" style={{display:"grid",gap:10}}>{pendingAction?<dialog ref={dialog} className="billing-cancel-dialog" aria-labelledby="billing-cancel-title" aria-describedby="billing-cancel-description" onCancel={event=>{if(busy)event.preventDefault();else setPendingAction(null);}}><span className="billing-cancel-warning" aria-hidden="true">!</span><h2 id="billing-cancel-title">Cancel your subscription?</h2><div id="billing-cancel-description">{pendingAction==="abandon_setup"?<p>This will close your unfinished payment setup. You can choose a plan again on Pricing.</p>:<><p>Automatic renewal will stop. You won’t be charged for future renewals.</p><p>{subscription.paidThroughAt?`You keep your paid features until ${new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeZone:"Asia/Kolkata"}).format(new Date(subscription.paidThroughAt))}.`:"Any remaining paid access continues until your paid period ends."}</p></>}</div>{notice?<p role="alert">{notice}</p>:null}<div className="billing-cancel-buttons"><button ref={keepButton} type="button" className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>setPendingAction(null)}>Keep subscription</button><button type="button" className="ui-button billing-cancel-confirm" disabled={Boolean(busy)} onClick={()=>void run(pendingAction)}>{busy?"Cancelling…":"Yes, cancel subscription"}</button></div></dialog>:null}{notice&&!pendingAction?<p role="status">{notice}</p>:null}<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    {!subscription.cancelAtPeriodEnd?<button className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>{setNotice(null);setPendingAction(subscription.status==="created"&&subscription.paidCount===0&&!subscription.paidThroughAt&&subscription.financialState==="unpaid"?"abandon_setup":subscription.canCancelImmediately?"cancel_immediate":"cancel_period_end");}}>{busy?"Cancelling…":"Cancel subscription"}</button>:<span>Your subscription is cancelled. Keep using your plan until your paid period ends.</span>}
  </div>
  </div>;
}
