'use client';
import {createPortal} from 'react-dom';

export function CheckoutTransition({stage}:{stage:'preparing'|'opening'}){
 return createPortal(<div className="checkout-transition" role="status" aria-live="polite" aria-atomic="true" aria-label="Opening secure checkout">
  <div className="checkout-transition-card">
   <div className="checkout-transition-emblem" aria-hidden="true"><span className="checkout-transition-orbit"/><span className="checkout-transition-orbit checkout-transition-orbit--inner"/><svg viewBox="0 0 24 24" fill="none"><path d="M12 3 4.5 6v5c0 4.7 3.2 8 7.5 10 4.3-2 7.5-5.3 7.5-10V6L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m8.5 12 2.3 2.3 4.7-4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
   <span className="checkout-transition-eyebrow">CA PROGRESS · RAZORPAY</span>
   <h2>{stage==='preparing'?'Preparing your checkout':'Opening secure payment'}</h2>
   <p>Your payment details stay with Razorpay.</p>
   <div className="checkout-transition-track" aria-hidden="true"><span/></div>
   <span className="checkout-transition-caption">{stage==='preparing'?'Confirming your plan and price':'Your payment window is on its way'}</span>
  </div>
 </div>,document.body);
}
