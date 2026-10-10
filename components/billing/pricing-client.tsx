"use client";
import {CheckoutRecovery} from './checkout-recovery';
import {checkoutIntent,clearCheckoutIntent,adoptCheckoutRequest} from '@/lib/billing/checkout-client.mjs';
import type {CheckoutView} from '@/lib/billing/checkout-engine.mjs';
import { quoteForMethod, type PaymentMethod } from "@/lib/billing/payment-quote.mjs";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { RecurringSubscriptionView } from "@/lib/billing/recurring-service";
import type { PublishedPricingOffer } from "@/lib/billing/commercial-policy";
import type { BillingCycle, PlanEntitlement, PlanTier, SubscriptionPlan } from "@/lib/billing/service";
import { PLAN_COMPARISON_COLUMNS, PLAN_COMPARISON_ROWS } from "@/lib/billing/plan-comparison.mjs";
import { productPlanLabel, storageQuotaMegabytes } from "@/lib/billing/plan-policy.mjs";
import type { AppCommercePolicy } from "@/lib/mobile/commerce-policy";

type CheckoutResult={razorpay_subscription_id:string;razorpay_payment_id:string;razorpay_signature:string};
type RazorpayInstance={open():void;on?(event:string,callback:(response:unknown)=>void):void};type RazorpayConstructor=new(options:Record<string,unknown>)=>RazorpayInstance;declare global{interface Window{Razorpay?:RazorpayConstructor}}
function loadCheckout(){return new Promise<boolean>(resolve=>{
  if(window.Razorpay){resolve(true);return;}
  let script=document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
  const fresh=!script;
  if(!script){script=document.createElement("script");script.src="https://checkout.razorpay.com/v1/checkout.js";script.async=true;}
  const target=script;
  const finish=(ready:boolean)=>{clearTimeout(timeout);target.removeEventListener("load",loaded);target.removeEventListener("error",failed);if(!ready)target.remove();resolve(ready);};
  const loaded=()=>finish(Boolean(window.Razorpay)),failed=()=>finish(false);
  const timeout=setTimeout(failed,15000);
  target.addEventListener("load",loaded,{once:true});target.addEventListener("error",failed,{once:true});
  if(fresh)document.head.appendChild(target);
});}

const featureCopy:Record<string,{name:string;help:string}>={
  core:{name:"Daily study tools",help:"Track study time, chapters, revisions, notes and tests."},
  forecast:{name:"Estimated finish date",help:"See when you could finish, based on your progress."},
  "progress-export":{name:"Progress report (PDF)",help:"Download your chapter and revision progress."},
  storage:{name:"File storage",help:"Store your study files privately."},
  analytics:{name:"Detailed study insights",help:"Find weak areas and understand your test performance."},
  planner:{name:"Study calendar",help:"Plan your study sessions in a calendar."},
  reminders:{name:"Personal reminders",help:"Set reminders for your study routine."},
  exports:{name:"Download study data (CSV)",help:"Download your study and test history."},
  buddy:{name:"Study with friends",help:"Share goals, send nudges and study together."},
  goals:{name:"Goals and reports",help:"Set detailed goals and follow your progress."},
  backup:{name:"Back up all your data",help:"Download a copy of your study data and files."},
};
const money=(subunits:number|null|undefined)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(subunits??0)/100);
function checkoutMatchesPolicy(plan:SubscriptionPlan,cycle:Exclude<BillingCycle,"free">,offer:PublishedPricingOffer|undefined,method:PaymentMethod){if(plan.tier_key==="free")return true;return plan.billing_cycle===cycle&&Boolean(plan.checkout_enabled)&&plan.currency==="INR"&&Boolean(offer?.checkoutReady)&&(method!=="upi"||!offer?.introEligible||offer.introOfferReady)&&offer?.currency==="INR";}
function storageLabel(plan:SubscriptionPlan,entitlements:PlanEntitlement[]=[]){const rule=entitlements.find(item=>item.plan_id===plan.id&&item.feature_key==="resources.storage");if(rule&&!rule.enabled)return "File storage unavailable";const megabytes=rule?.limit_unit==="megabytes"&&rule.limit_value!=null?rule.limit_value:storageQuotaMegabytes(plan.tier_key);return megabytes>=1024?`${Number((megabytes/1024).toFixed(1))} GB private storage`:`${megabytes} MB private storage`;}

function WebPricingClient({plans,entitlements,authenticated,currentPlanId,offers,viewerId,hasRecurring,subscription}:{subscription:RecurringSubscriptionView|null;hasRecurring:boolean;viewerId:string|null;plans:SubscriptionPlan[];entitlements:PlanEntitlement[];authenticated:boolean;currentPlanId:string|null;offers:PublishedPricingOffer[]}){
  const checkoutGuard=useRef(false);
  const [reviewPlan,setReviewPlan]=useState<SubscriptionPlan|null>(null);
  const reviewDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(reviewPlan&&!reviewDialog.current?.open)reviewDialog.current?.showModal();},[reviewPlan]);
  const router=useRouter(),[cycle,setCycle]=useState<Exclude<BillingCycle,"free">>("monthly"),[method,setMethod]=useState<PaymentMethod>("upi"),[promoCode,setPromoCode]=useState(""),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState<{tone:"success"|"error"|"info";text:string}|null>(null),[fallbackUrl,setFallbackUrl]=useState<string|null>(null);const visible=useMemo(()=>[plans.find(plan=>plan.tier_key==="free"),plans.find(plan=>plan.tier_key==="basic"&&plan.billing_cycle===cycle),plans.find(plan=>plan.tier_key==="pro"&&plan.billing_cycle===cycle)].filter(Boolean) as SubscriptionPlan[],[plans,cycle]),currentTier=plans.find(plan=>plan.id===(hasRecurring?subscription?.planId:currentPlanId))?.tier_key??null,offerFor=(plan:SubscriptionPlan)=>offers.find(offer=>offer.planId===plan.id),comparisonValue=(featureKey:string|undefined,tier:PlanTier)=>{if(!featureKey){const plan=plans.find(item=>item.tier_key===tier&&(tier==="free"||item.billing_cycle===cycle));return plan?storageLabel(plan,entitlements).replace(" private storage",""):"—";}const plan=plans.find(item=>item.tier_key===tier&&(tier==="free"||item.billing_cycle===cycle)),rule=entitlements.find(item=>item.plan_id===plan?.id&&item.feature_key===featureKey);return rule?.enabled?"Included":"—";};
  async function switchPlan(plan:SubscriptionPlan){
    if(checkoutGuard.current||!subscription)return;
    if(plan.tier_key==="free"){router.push("/billing#manage-plan");return;}
    if(subscription.status!=="active"||subscription.cancelAtPeriodEnd){setNotice({tone:"info",text:"You can change plans once your subscription is active and renewal is on. See Billing for your subscription status."});return;}
    if(!window.confirm(`Switch to ${productPlanLabel(plan.tier_key)} for ${money(plan.price_subunits)} per ${cycle==="monthly"?"month":"year"}? Your new plan starts on your next payment date. You keep your current plan until then.`))return;
    checkoutGuard.current=true;setBusy(plan.id);setNotice(null);
    try{const response=await fetch("/api/v1/payments/subscription-action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscriptionId:subscription.providerSubscriptionId,action:"change_plan",targetPlanId:plan.id,requestId:crypto.randomUUID()})});if(!response.ok)throw new Error();setNotice({tone:"success",text:`Your switch to ${productPlanLabel(plan.tier_key)} is scheduled for your next payment date.`});router.refresh();}catch{setNotice({tone:"error",text:"We couldn’t change your plan. Please try again shortly."});}finally{checkoutGuard.current=false;setBusy(null);}
  }
  async function openOriginal(created:CheckoutView){
    if(checkoutGuard.current)return;
    checkoutGuard.current=true;setBusy(created.planId);setNotice(null);
    const finish=()=>{checkoutGuard.current=false;setBusy(null);};
    try{
      if(created.errorCode==="mandate_schedule_unsupported")throw new Error("This old mandate exceeds the supported duration. Close the unpaid setup in Billing, then start a fresh checkout.");
      if(!created.resumable||!created.subscriptionId||!created.keyId)throw new Error("Your payment is being confirmed. Billing will update automatically.");
      setNotice({tone:"info",text:`Original checkout: ${money(created.initialAmount)} first charge, then ${money(created.recurringAmount)} recurring · ${created.paymentMethod}, for up to ${created.totalCount} scheduled charges.`});
      const authorizationUrl=created.authorizationUrl??null;
      setFallbackUrl(authorizationUrl);
      if(!await loadCheckout()||!window.Razorpay)throw new Error("Razorpay could not load. Your checkout is saved. Use the secure payment link below.");
      const checkout=new window.Razorpay({key:created.keyId,subscription_id:created.subscriptionId,name:"CA Progress",description:`${created.billingCycle} subscription`,config:{display:{blocks:{selected:{name:created.paymentMethod==="upi"?"UPI AutoPay":created.paymentMethod==="card"?"Card":"eMandate",instruments:[{method:created.paymentMethod}]}},sequence:["block.selected"],preferences:{show_default_blocks:false}}},theme:{color:"#4f46e5"},modal:{ondismiss:()=>{finish();setFallbackUrl(authorizationUrl);setNotice({tone:"info",text:"Your checkout is saved. Continue payment here, or open Billing for automatic updates."});}},handler:async(result:CheckoutResult)=>{
        try{const verified=await fetch("/api/v1/payments/verify-subscription",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(result)});if(!verified.ok)throw new Error("Payment verification is pending.");const response=await fetch("/api/v1/payments/checkout/recover",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({attemptId:created.attemptId})});const recovered=await response.json() as {checkout?:CheckoutView};const granted=response.ok&&recovered.checkout?.accessGranted===true;if(granted&&viewerId)clearCheckoutIntent(localStorage,viewerId,created.requestId);router.push(`/billing?payment=${granted?"success":"pending"}`);}catch{router.push("/billing?payment=pending");}finally{finish();}
      }});
      checkout.on?.("payment.failed",()=>{finish();router.push("/billing?payment=pending");});checkout.open();
    }catch(error){finish();setNotice({tone:"error",text:error instanceof Error?error.message:"Could not resume checkout."});}
  }
  async function purchase(plan:SubscriptionPlan){
    if(checkoutGuard.current)return;
    if(plan.tier_key==="free"){router.push("/dashboard");return;}
    if(!authenticated||!viewerId){router.push(`/login?next=${encodeURIComponent("/pricing")}`);return;}
    const offer=offerFor(plan);
    if(!checkoutMatchesPolicy(plan,cycle,offer,method)){setNotice({tone:"info",text:"This checkout stays locked until its published server policy has a valid price and recurring terms."});return;}
    checkoutGuard.current=true;setBusy(plan.id);setNotice(null);setFallbackUrl(null);
    let original:CheckoutView|null=null;
    try{
      // Billing closure happens in another page; discard its completed browser intent before purchase.
      const saved=await fetch('/api/v1/payments/checkout/status',{cache:'no-store'}).then(async response=>response.ok?(await response.json()).checkout:null).catch(()=>null);
      if(saved&&['failed','cancelled','succeeded'].includes(saved.state))clearCheckoutIntent(localStorage,viewerId,saved.requestId);
      let input=checkoutIntent(localStorage,viewerId,{planId:plan.id,paymentMethod:method,policyVersionId:offer?.policyVersionId??"",promoCode:promoCode.trim().toUpperCase()},()=>crypto.randomUUID());
      let response=await fetch("/api/v1/payments/create-subscription",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
      let result=await response.json() as CheckoutView&{error?:string};
      if(result.state==='failed'&&result.errorCode==='provider_request_not_dispatched'){
        clearCheckoutIntent(localStorage,viewerId,input.requestId);
        input=checkoutIntent(localStorage,viewerId,{planId:plan.id,paymentMethod:method,policyVersionId:offer?.policyVersionId??"",promoCode:promoCode.trim().toUpperCase()},()=>crypto.randomUUID());
        response=await fetch("/api/v1/payments/create-subscription",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
        result=await response.json() as CheckoutView&{error?:string};
      }
      if(!response.ok){const status=await fetch('/api/v1/payments/checkout/status',{cache:'no-store'}).then(r=>r.json()).catch(()=>null);if(status?.checkout?.state==='failed')clearCheckoutIntent(localStorage,viewerId,input.requestId);throw new Error(result.error||'Checkout requires reconciliation. Open Billing to check it.');}
      if(result.accessGranted){clearCheckoutIntent(localStorage,viewerId,input.requestId);router.push('/billing?payment=success');return;}
      if(!result.subscriptionId)throw new Error("We are confirming your saved checkout. Billing will update automatically.");
      const expected=quoteForMethod({recurring:offer!.recurringPriceSubunits,intro:offer!.introPriceSubunits,eligible:offer!.introEligible,trialDays:offer!.trialDays},method);
      if(!result.campaignApplied&&(result.initialAmount!==expected.firstChargeSubunits||result.recurringAmount!==expected.recurringPriceSubunits))throw new Error("The existing checkout keeps its original price. Review and resume it below.");
      adoptCheckoutRequest(localStorage,viewerId,result.requestId);
      original=result;
    }catch(error){setNotice({tone:"error",text:error instanceof Error?error.message:"Checkout was interrupted. Open Billing to check the saved attempt."});}
    finally{checkoutGuard.current=false;setBusy(null);}
    if(original)await openOriginal(original);
  }
  return <div className="phase11-pricing">{reviewPlan?<dialog ref={reviewDialog} className="billing-review" aria-labelledby="billing-review-title" onCancel={()=>setReviewPlan(null)} onKeyDown={event=>{if(event.key==="Escape"&&!busy)setReviewPlan(null);}}><h2 id="billing-review-title">Review your {productPlanLabel(reviewPlan.tier_key)} subscription</h2><label>Pay with <select value={method} disabled={Boolean(busy)} onChange={event=>setMethod(event.target.value as PaymentMethod)}><option value="upi">UPI AutoPay</option><option value="card">Card</option><option value="emandate">eMandate</option></select></label><details><summary>Add promo code</summary><label>Promo code<input value={promoCode} maxLength={80} autoComplete="off" onChange={event=>setPromoCode(event.target.value.toUpperCase())}/></label></details>{(()=>{const offer=offerFor(reviewPlan);const quote=quoteForMethod({recurring:Number(offer?.recurringPriceSubunits??reviewPlan.price_subunits),intro:offer?.introPriceSubunits,eligible:offer?.introEligible,trialDays:offer?.trialDays},method);return <><p><strong>Due today: {money(quote.dueTodaySubunits)}</strong></p><p><strong>Then:</strong> {money(quote.recurringPriceSubunits)} per {cycle==="monthly"?"month":"year"}. {quote.introApplied?`Your introductory UPI price applies for ${offer?.introRemainingCycles} billing ${offer?.introRemainingCycles===1?"period":"periods"}.`:""}</p>{offer?.trialDays?<p>Your first payment follows your {offer.trialDays}-day trial. Your bank may ask you to approve automatic payments.</p>:null}<p>Approve up to {offer?.mandateTotalCount} automatic payments over {offer?.mandateDurationMonths} months. You’ll be asked to approve payments again afterwards. Cancellation: stop renewal anytime; keep access through your paid period.</p>{offer?.termsNote?<p>{offer.termsNote}</p>:null}{promoCode?<small>Promo price confirmed in Razorpay.</small>:null}</>;})()}<div style={{display:"flex",gap:12,marginTop:20}}><button type="button" className="ui-button ui-button--secondary" disabled={Boolean(busy)} onClick={()=>setReviewPlan(null)}>Back to plans</button><button type="button" className="ui-button ui-button--primary" disabled={Boolean(busy)} onClick={()=>{const plan=reviewPlan;setReviewPlan(null);void purchase(plan);}}>Continue to secure payment</button></div></dialog>:null}{authenticated?<CheckoutRecovery refreshKey={busy} viewerId={viewerId} webCheckoutAllowed={true} onResume={openOriginal}/>:null}{plans.some(plan=>plan.billing_cycle==="annual"&&plan.checkout_enabled)?<div className="phase11-cycle" role="group" aria-label="Billing cycle"><button className={cycle==="monthly"?"is-active":""} onClick={()=>setCycle("monthly")}>Monthly</button><button className={cycle==="annual"?"is-active":""} disabled={Boolean(busy)||!plans.some(plan=>plan.billing_cycle==="annual"&&plan.checkout_enabled)} onClick={()=>setCycle("annual")}>Annual</button></div>:null}{notice?<div className={`phase11-notice phase11-notice--${notice.tone}`} role="status">{notice.text}</div>:null}{fallbackUrl?<div className="mx-auto mt-3 flex max-w-md items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm"><span className="text-muted-foreground">UPI QR not loading?</span><a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="ui-button ui-button--secondary">Open Razorpay secure page</a></div>:null}<section className="pricing-matrix" aria-label="Compare CA Progress plans"><div className="pricing-matrix-scroll"><table><colgroup><col className="pricing-feature-column"/>{PLAN_COMPARISON_COLUMNS.map(column=><col key={column.tier}/>)}</colgroup><thead><tr><th scope="col"><span className="pricing-overline">YOUR STUDY TOOLKIT</span><strong>Compare every plan</strong><small>All plans keep your progress.</small></th>{visible.map(plan=>{const current=plan.tier_key===currentTier,offer=offerFor(plan),quote=quoteForMethod({recurring:Number(offer?.recurringPriceSubunits??plan.price_subunits),intro:offer?.introPriceSubunits,eligible:offer?.introEligible,trialDays:offer?.trialDays},method);return <th scope="col" key={plan.id} className={`pricing-column pricing-column--${plan.tier_key}`}><span className="pricing-overline">{current?"YOUR PLAN":plan.tier_key==="basic"?"PLAN & COLLABORATE":plan.tier_key==="pro"?"INSIGHTS & BACKUP":"STUDY ESSENTIALS"}</span><strong>{productPlanLabel(plan.tier_key)}</strong><div className="pricing-matrix-price">{money(offer?.recurringPriceSubunits??plan.price_subunits)}<small>{plan.tier_key==="free"?"forever":`/${cycle==="monthly"?"month":"year"}`}</small></div>{quote.introApplied&&offer?<span className="pricing-discount">{money(quote.firstChargeSubunits)} first {offer.introRemainingCycles===1?(cycle==="monthly"?"month":"year"):`${offer.introRemainingCycles} periods`} · UPI offer</span>:<span className="pricing-plan-hint">{plan.tier_key==="free"?"No payment needed":plan.tier_key==="pro"?"Everything in Basic + more":"Automatic monthly renewal"}</span>}</th>;})}</tr></thead><tbody>{PLAN_COMPARISON_ROWS.map(row=><tr key={row.key}><th scope="row" title={featureCopy[row.key]?.help??row.detail}>{featureCopy[row.key]?.name??row.label}<span className="pricing-row-context">{row.key==="core"?"Tracking, notes, revisions & tests":row.key==="buddy"?"Shared goals, nudges & study together":row.key==="analytics"?"Weakness, consistency & test insights":null}</span></th>{PLAN_COMPARISON_COLUMNS.map(column=>{const value=comparisonValue(row.featureKey,column.tier);return <td key={column.tier} className={`pricing-column--${column.tier}`}>{value==="Included"?<span className="pricing-included"><Icon name="check" size={16}/><span className="sr-only">Included</span></span>:value==="—"?<span aria-label="Not included" className="pricing-unavailable">—</span>:<strong>{value}</strong>}</td>;})}</tr>)}</tbody><tfoot><tr><th scope="row"><strong>Choose what fits you</strong><small>Cancel renewal anytime.</small></th>{visible.map(plan=>{const current=plan.tier_key===currentTier,offer=offerFor(plan),configured=checkoutMatchesPolicy(plan,cycle,offer,method);return <td key={plan.id} className={`pricing-column--${plan.tier_key}`}><button className={`ui-button ${plan.tier_key==="free"?"ui-button--secondary":"ui-button--primary"}`} disabled={Boolean(busy)||current||subscription?.scheduledTargetPlanId===plan.id||(!configured&&plan.tier_key!=="free")} onClick={()=>{if(plan.tier_key==="free"){if(hasRecurring)void switchPlan(plan);else void purchase(plan);}else if(!authenticated)router.push(`/login?next=${encodeURIComponent("/pricing")}`);else if(hasRecurring)void switchPlan(plan);else setReviewPlan(plan);}}>{subscription?.scheduledTargetPlanId===plan.id?"Switch scheduled":current?"Current plan":busy===plan.id?"Opening…":plan.tier_key==="free"?(hasRecurring?"Move to Free":"Continue free"):configured?`${hasRecurring?"Change to":"Choose"} ${productPlanLabel(plan.tier_key)}`:"Currently unavailable"}</button></td>;})}</tr></tfoot></table></div></section><p className="billing-small-note">Secure payment by Razorpay · Cancel renewal anytime</p></div>;
}

type PricingProps = { subscription:RecurringSubscriptionView|null; hasRecurring:boolean; viewerId:string|null; plans: SubscriptionPlan[]; entitlements: PlanEntitlement[]; authenticated: boolean; currentPlanId: string | null; offers: PublishedPricingOffer[]; commercePolicy: AppCommercePolicy };

function NativeStorePricing({ plans, entitlements, currentPlanId, commercePolicy }: Pick<PricingProps, "plans" | "entitlements" | "currentPlanId" | "commercePolicy">) {
  const visible = plans.filter((plan) => plan.tier_key === "free" || plan.billing_cycle === "monthly").filter((plan, index, rows) => rows.findIndex((item) => item.tier_key === plan.tier_key) === index);
  return <div className="phase11-pricing"><div className="phase11-notice phase11-notice--info" role="status"><strong>Store billing is not enabled in this preview build.</strong><br/>{commercePolicy.message} Existing website subscriptions and entitlements remain available after sign-in.</div><section className="phase11-plan-grid" aria-label="CA Progress plans">{visible.map((plan) => { const current = plan.id === currentPlanId; const label = productPlanLabel(plan.tier_key); return <article key={plan.id} className={`phase11-plan-card phase11-plan-card--${plan.tier_key} ${current ? "is-current" : ""}`}><div className="phase11-plan-top"><div><span className="phase11-tier">{label}</span><h2>{label}</h2></div>{current ? <span className="phase11-current"><Icon name="check" size={14}/>Current</span> : null}</div><p>{plan.tagline}</p><ul><li><Icon name="check" size={16}/>Same account and cloud progress</li><li><Icon name="check" size={16}/>{storageLabel(plan,entitlements)}</li><li><Icon name="shield" size={16}/>Server-verified entitlement access</li></ul><button className="ui-button ui-button--secondary" type="button" disabled>{current ? "Current plan" : "Store purchase unavailable"}</button></article>; })}</section><div className="phase11-security-note"><Icon name="shield"/><div><strong>No Razorpay checkout is loaded inside the native app.</strong><p>Apple and Google product identifiers are intentionally unconfigured until Phase 11 creates the native billing bridge and the products are approved in each store.</p></div></div></div>;
}

export function PricingClient(props: PricingProps) {
  if (!props.commercePolicy.webCheckoutAllowed) return <NativeStorePricing entitlements={props.entitlements} plans={props.plans} currentPlanId={props.currentPlanId} commercePolicy={props.commercePolicy}/>;
  return <WebPricingClient subscription={props.subscription} hasRecurring={props.hasRecurring} plans={props.plans} entitlements={props.entitlements} authenticated={props.authenticated} currentPlanId={props.currentPlanId} offers={props.offers} viewerId={props.viewerId}/>;
}
