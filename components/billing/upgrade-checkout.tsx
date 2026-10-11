"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {UpgradeQuote} from '@/lib/billing/subscription-rules.mjs';
import type {UpgradeView} from '@/lib/billing/upgrade-engine.mjs';
import type {PaymentMethod} from '@/lib/billing/payment-quote.mjs';
type Review={planId:string;method:PaymentMethod;quoteId:string;expiresAt:string;kind?:string;quote:UpgradeQuote;checkoutReady:boolean};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
const date=(s:string)=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(s));
export function UpgradeCheckout({introPurchase=false,planId,onClose,loadCheckout,onBusyChange}:{introPurchase?:boolean;planId:string|null;onClose:()=>void;loadCheckout:()=>Promise<boolean>;onBusyChange:(busy:boolean)=>void}){
 const router=useRouter(),dialog=useRef<HTMLDialogElement>(null),guard=useRef(false);
 const [reviewData,setReview]=useState<Review|null>(null),[saved,setSaved]=useState<UpgradeView|null>(null),[method,setMethod]=useState<PaymentMethod>('upi'),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const review=reviewData?.planId===planId&&reviewData?.method===method?reviewData:null;
 const savedId=saved?.quoteId,savedReady=saved?.renewalReady;
 const accessRefreshed=useRef<string|null>(null);
 const setWorking=(value:boolean)=>{guard.current=value;setBusy(value);onBusyChange(value);};
 useEffect(()=>{let active=true;void fetch('/api/v1/payments/upgrade',{cache:'no-store'}).then(r=>r.json()).then(result=>{if(active)setSaved(result.upgrade??null);}).catch(()=>undefined);return()=>{active=false;};},[]);
 useEffect(()=>{
  if(!planId)return;
  const controller=new AbortController();
  void fetch('/api/v1/payments/upgrade-quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({planId,paymentMethod:method,purchaseKind:introPurchase?"intro":"upgrade"}),signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Your upgrade review is unavailable.');if(!controller.signal.aborted)setReview({...result,planId,method});}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
  return()=>controller.abort();
 },[planId,method,introPurchase]);
 useEffect(()=>{if(planId&&!dialog.current?.open)dialog.current?.showModal();},[planId]);
 useEffect(()=>{
  if(!savedId||savedReady)return;
  let active=true,count=0;const id=savedId;
  const timer=setInterval(()=>{if(!active||guard.current||document.hidden||count++>=12)return;void fetch('/api/v1/payments/upgrade',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quoteId:id,action:'recover'})}).then(r=>r.json()).then(result=>{if(active&&result.upgrade){setSaved(result.upgrade);if(result.upgrade.accessGranted&&accessRefreshed.current!==id){accessRefreshed.current=id;router.refresh();}}}).catch(()=>undefined);},10000);
  return()=>{active=false;clearInterval(timer);};
 },[savedId,savedReady,router]);
 async function action(quoteId:string,actionName:string,proof:Record<string,string>={}){
  const response=await fetch('/api/v1/payments/upgrade',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quoteId,action:actionName,...proof})});
  const result=await response.json();if(result.upgrade)setSaved(result.upgrade);
  if(!response.ok||result.error)throw new Error(result.error||'Your upgrade is being confirmed.');return result;
 }
 async function renew(id:string){
  const result=await action(id,'renewal');const checkout=result.checkout;
  if(!checkout?.subscriptionId)throw new Error('Your renewal approval is saved and being prepared.');
  if(!await loadCheckout()||!window.Razorpay)throw new Error('Secure payment could not load. Use Continue setup to try again.');
  const Razorpay=window.Razorpay;
  await new Promise<void>((resolve,reject)=>{
   const instance=new Razorpay({key:checkout.keyId,subscription_id:checkout.subscriptionId,name:'CA Progress',description:'Approve future Pro renewals',config:{display:{blocks:{selected:{name:'Automatic monthly renewal',instruments:[{method:checkout.paymentMethod}]}},sequence:['block.selected'],preferences:{show_default_blocks:false}}},theme:{color:'#4f46e5'},modal:{ondismiss:()=>reject(new Error('Your paid Pro access is ready. You can approve future renewals later.'))},handler:async(proof:Record<string,string>)=>{
    try{const verified=await fetch('/api/v1/payments/verify-subscription',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(proof)});if(!verified.ok)throw new Error('Your bank approval is being checked.');await action(id,'confirm_renewal');resolve();}catch(reason){reject(reason);}
   }});instance.on?.('payment.failed',()=>reject(new Error('Your paid Pro access is ready. Please try renewal approval again.')));instance.open();
  });
  router.refresh();
 }
 async function pay(id:string){
  if(guard.current)return;dialog.current?.close();onClose();setWorking(true);setError(null);
  try{
   const result=await action(id,'pay'),upgrade=result.upgrade as UpgradeView;
   if(!upgrade.accessGranted){
    if(!upgrade.orderId)throw new Error('Your upgrade payment is being prepared.');
    if(!await loadCheckout()||!window.Razorpay)throw new Error('Secure payment could not load. Your upgrade is saved; try Continue payment.');
    const Razorpay=window.Razorpay;
  await new Promise<void>((resolve,reject)=>{
     const instance=new Razorpay({key:upgrade.keyId,order_id:upgrade.orderId,amount:upgrade.quote.amountDueSubunits,currency:upgrade.quote.currency,name:'CA Progress',description:upgrade.kind==='intro'?'First month of Pro':'Pro upgrade after unused Basic credit',theme:{color:'#4f46e5'},modal:{ondismiss:()=>reject(new Error('Your Pro payment is saved. Continue whenever you’re ready.'))},handler:async(proof:Record<string,string>)=>{try{await action(id,'verify',proof);resolve();}catch(reason){reject(reason);}}});instance.on?.('payment.failed',()=>reject(new Error('Payment was not completed. Your current plan remains available. You can try again.')));instance.open();
    });
   }
   setReview(null);onClose();router.refresh();await renew(id);
  }catch(reason){setError(reason instanceof Error?reason.message:'Your upgrade is being checked.');const latest=await fetch('/api/v1/payments/upgrade',{cache:'no-store'}).then(r=>r.json()).catch(()=>null);if(latest?.upgrade)setSaved(latest.upgrade);router.refresh();}
  finally{setWorking(false);}
 }
 async function continueRenewal(id:string){if(guard.current)return;setWorking(true);setError(null);try{await renew(id);}catch(reason){setError(reason instanceof Error?reason.message:'Your renewal is being confirmed.');}finally{setWorking(false);}}
 const close=()=>{if(busy)return;setReview(null);setError(null);onClose();};
 return <>{saved&&!saved.renewalReady?<section className="upgrade-saved" aria-label="Your Pro payment"><div><strong>{saved.state==='review'?'Your Pro payment needs review':saved.accessGranted?'Your Pro access is ready':saved.kind==='intro'?'Your Pro payment is saved':'Your upgrade is saved'}</strong><p>{saved.state==='review'?'See Billing for your payment and refund status.':saved.accessGranted?`Access until ${date(saved.quote.nextRenewalAt)}. ${saved.sourceCancelled?'Approve future monthly renewals to keep Pro going.':'We’re confirming that your previous renewal has stopped.'}`:(saved.kind==='intro'?'Continue payment to start your first month of Pro.':'Continue payment. Your current paid access stays available while payment is checked.')}</p></div><button className="ui-button ui-button--primary" disabled={busy||saved.state==='review'||Boolean(saved.accessGranted&&!saved.sourceCancelled)} onClick={()=>saved.accessGranted?void continueRenewal(saved.quoteId):void pay(saved.quoteId)}>{busy?'Please wait…':saved.accessGranted?'Continue setup':'Continue payment'}</button></section>:null}{error&&!planId?<p className="phase11-notice phase11-notice--info" role="status">{error}</p>:null}{planId?<dialog ref={dialog} className="billing-review upgrade-review" aria-labelledby="upgrade-review-title" onCancel={event=>{if(busy)event.preventDefault();else close();}}><h2 id="upgrade-review-title">{introPurchase?"Review your Pro subscription":"Review your Pro upgrade"}</h2>{review?<><span className="pricing-offer-badge">{review.quote.mode==='intro_full_month'?'Your first paid month of Pro':'Pay only for the remaining period'}</span><p>{review.quote.mode==='intro_full_month'?(introPurchase?"A full month of Pro starts when your payment is verified. Approve monthly renewals after payment.":`A full month of Pro, with your unused Basic payment deducted. Your next renewal moves to ${date(review.quote.nextRenewalAt)}.`):`Pro for the rest of your paid period, until ${date(review.quote.nextRenewalAt)}. Your renewal date stays the same.`}</p><dl className="upgrade-price-breakdown"><div><dt>{review.quote.mode==='intro_full_month'?'First month of Pro':'Pro for your remaining period'}</dt><dd>{money(review.quote.planChargeSubunits)}</dd></div>{!introPurchase?<div><dt>Unused Basic payment credit</dt><dd>−{money(review.quote.unusedCreditSubunits)}</dd></div>:null}<div className="upgrade-total"><dt>You pay today</dt><dd>{money(review.quote.amountDueSubunits)}</dd></div></dl><p><strong>Next payment:</strong> {money(review.quote.recurringPriceSubunits)} {introPurchase?"one month after Pro starts, then monthly.":`on ${date(review.quote.nextRenewalAt)}, then monthly.`}</p><label>Approve future renewals with<select value={method} disabled={busy} onChange={event=>{setError(null);setReview(null);setMethod(event.target.value as PaymentMethod);}}><option value="upi">UPI AutoPay</option><option value="card">Card</option><option value="emandate">eMandate</option></select></label><p className="billing-small-note">Pro starts after payment is verified. Then approve future renewals in your bank app. Your bank may temporarily debit a verification amount and return it. {!introPurchase?" Your old subscription stops renewing.":""}</p></>:<p role="status">{error||'Calculating your unused credit…'}</p>}{error&&review?<p role="alert" className="phase11-notice phase11-notice--error">{error}</p>:null}<div className="upgrade-review-actions"><button className="ui-button ui-button--secondary" disabled={busy} onClick={close}>Back to plans</button><button className="ui-button ui-button--primary" disabled={!review||busy} onClick={()=>review&&void pay(review.quoteId)}>{busy?'Please wait…':review?`Continue · ${money(review.quote.amountDueSubunits)}`:'Please wait…'}</button></div></dialog>:null}</>;
}
