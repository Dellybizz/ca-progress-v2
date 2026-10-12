'use client';
import {createPortal} from 'react-dom';

export function CheckoutTransition({stage}:{stage:'preparing'|'opening'}){
 if(stage==='opening')return null;
 return createPortal(<div className="checkout-transition" role="status" aria-live="polite" aria-atomic="true" aria-label="Opening secure checkout">
  <div className="checkout-handoff" aria-hidden="true">
   <div className="checkout-handoff-shadow"/>
   <div className="checkout-handoff-card">
    <div className="checkout-handoff-face checkout-handoff-face--plan"><span className="checkout-handoff-brand">CA Progress</span><span className="checkout-handoff-mark">CP</span><span className="checkout-handoff-detail">Your next chapter</span></div>
    <div className="checkout-handoff-face checkout-handoff-face--payment"><span className="checkout-handoff-brand">Razorpay</span><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M3 10h18M7 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span className="checkout-handoff-detail">Secure payment</span></div>
   </div>
  </div>
  <p className="checkout-handoff-caption">Opening your payment</p>
 </div>,document.body);
}
