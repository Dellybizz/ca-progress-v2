'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import type {PaymentMethod} from '@/lib/billing/payment-quote.mjs';
import type {PublishedPricingOffer} from '@/lib/billing/commercial-policy';
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n/100);
export function SingleMandateReview({offer,label,onClose,onContinue,preparing=false,feedback}:{offer:PublishedPricingOffer;label:string;onClose:()=>void;onContinue:(method:PaymentMethod,accepted:boolean)=>void;preparing?:boolean;feedback?:string}){
 const dialog=useRef<HTMLDialogElement>(null),[method,setMethod]=useState<PaymentMethod>((offer.singleMandateMethods?.[0]??'upi') as PaymentMethod);
 const fallback=Boolean(offer.singleMandateFallbackMethods?.includes(method));
 useLayoutEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="billing-review upgrade-review subscription-review" aria-labelledby="single-mandate-title" aria-busy={preparing} onCancel={event=>{if(preparing)event.preventDefault();else onClose();}}>
 <header className="subscription-review-header"><div><span className="subscription-review-eyebrow">YOUR SUBSCRIPTION</span><h2 id="single-mandate-title">{label}</h2></div><button type="button" className="subscription-review-close" aria-label="Close subscription review" disabled={preparing} onClick={onClose}>×</button></header>
 <section className="subscription-review-price"><span className="subscription-review-offer">First-month offer</span><span className="subscription-review-price-label">First payment</span><strong>{money(Number(offer.upgradeIntroPriceSubunits))}</strong><p>For your first month</p></section>
 <section className="subscription-review-renewal"><div><span>Then monthly</span><strong>{money(offer.recurringPriceSubunits)}<small> / month</small></strong></div><p>Automatically from your next billing date</p><span className="subscription-review-cancel">Cancel renewal anytime</span></section>
 <fieldset className="subscription-review-methods" disabled={preparing}><legend>Pay and approve automatic payments with</legend><div>{([{value:'upi',label:'UPI AutoPay'},{value:'card',label:'Card'}] as const).filter(option=>offer.singleMandateMethods?.includes(option.value)).map(option=><label key={option.value} className={method===option.value?'is-selected':''}><span>{option.label}</span><input type="radio" name="single-mandate-method" checked={method===option.value} onChange={()=>setMethod(option.value)}/></label>)}</div></fieldset>
 <p className="subscription-review-help">Approve automatic payments once. Future months renew automatically through the same subscription.</p>
 {fallback?<p className="subscription-review-help">If the offer is unavailable, the first month is {money(offer.recurringPriceSubunits)}. Check the final amount in Razorpay before paying.</p>:null}
 {feedback?<p role="status" aria-live="polite">{feedback}</p>:null}
 <div className="upgrade-review-actions"><button type="button" className="ui-button ui-button--primary" disabled={preparing} onClick={()=>onContinue(method,fallback)}>{preparing?"Opening secure payment…":"Continue to payment"}</button></div><p className="subscription-review-secure">Secure checkout by Razorpay</p>
 </dialog>;
}
