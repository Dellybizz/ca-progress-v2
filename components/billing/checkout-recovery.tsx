'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {CheckoutView} from '@/lib/billing/checkout-engine.mjs';
import {monitorCheckout} from '@/lib/billing/checkout-monitor.mjs';
import {clearCheckoutIntent} from '@/lib/billing/checkout-client.mjs';
export function CheckoutRecovery({viewerId,onResume,webCheckoutAllowed,refreshKey}:{refreshKey?:string|null;webCheckoutAllowed:boolean;viewerId?:string|null;onResume?:(view:CheckoutView)=>Promise<void>}){
  const router=useRouter();
  const [view,setView]=useState<CheckoutView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const guard=useRef(false),refreshed=useRef<string|null>(null);
  function accept(next:CheckoutView|null){setView(next);if(next&&['failed','cancelled','succeeded'].includes(next.state)&&viewerId)clearCheckoutIntent(localStorage,viewerId,next.requestId);if(next?.accessGranted&&refreshed.current!==next.attemptId){refreshed.current=next.attemptId;router.refresh();}}
  useEffect(()=>{
    const controller=new AbortController();
    const signal=()=>AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]);
    const stop=monitorCheckout({
      canCheck:()=>!document.hidden&&!guard.current,
      read:async()=>{const response=await fetch('/api/v1/payments/checkout/status',{cache:'no-store',signal:signal()});if(!response.ok)throw new Error('unavailable');return (await response.json()).checkout;},
      reconcile:async next=>{
        if(!webCheckoutAllowed)return next;
        guard.current=true;
        try{const response=await fetch('/api/v1/payments/checkout/recover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({attemptId:next.attemptId}),signal:signal()});if(!response.ok)throw new Error('unavailable');return (await response.json()).checkout;}finally{guard.current=false;}
      },
      publish:next=>{accept(next);setError('');},
      onError:()=>setError('Updates are taking longer than usual. Your checkout is saved.'),
    });
    return()=>{stop();controller.abort();};
    // The attempt is read from the server on every check; no payment is created here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[viewerId,webCheckoutAllowed,refreshKey]);
  async function recover(resume=false){if(!view||guard.current)return;guard.current=true;setBusy(true);setError('');try{const response=await fetch('/api/v1/payments/checkout/recover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({attemptId:view.attemptId}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error('Your checkout is saved. We could not get an update yet; please try again shortly.');const next=result.checkout as CheckoutView;accept(next);if(resume&&next.resumable&&onResume)await onResume(next);}catch(caught){setError(caught instanceof Error?caught.message:'Payment updates are temporarily unavailable.');}finally{guard.current=false;setBusy(false);}}
  if(!view||['failed','cancelled','succeeded'].includes(view.state)||view.accessGranted)return null;
  const unsupported=view.errorCode==='mandate_schedule_unsupported';
  return <div className="phase11-notice phase11-notice--info" role="status" aria-live="polite"><strong>{unsupported?'Payment setup needs your attention':view.resumable?'Finish your payment':'Confirming your payment'}</strong><p>{unsupported?'Close the old unpaid setup in Billing to authorize a new subscription.':view.resumable?'Your checkout is saved. Continue securely with the same price and payment method.':'We check automatically and update your plan when payment is confirmed. You can leave this page and return later.'}</p>{view.initialAmount!==null?<p>First payment: ₹{view.initialAmount/100}. Then ₹{Number(view.recurringAmount)/100} per {view.billingCycle==='annual'?'year':'month'}.</p>:null}{webCheckoutAllowed?<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{view.resumable&&onResume?<button type="button" className="ui-button ui-button--primary" disabled={busy} onClick={()=>void recover(true)}>{busy?'Opening…':'Continue payment'}</button>:null}{view.resumable&&!onResume?<a href="/pricing" className="ui-button ui-button--primary">Continue payment</a>:null}<button type="button" className="ui-button ui-button--secondary" disabled={busy} onClick={()=>void recover()}>{busy?'Checking…':'Check again'}</button></div>:null}{unsupported?<a href="/billing">Manage payment setup</a>:null}{error?<p role="alert">{error}</p>:null}</div>;
}
