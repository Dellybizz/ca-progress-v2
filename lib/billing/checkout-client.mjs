// Identifiers only: no provider signature, payment details or authentication material.
const key=user=>`ca-progress:checkout:v2:${user}`;
export function readCheckoutIntent(storage,user){try{const value=JSON.parse(storage.getItem(key(user))??'null');return value&&typeof value.requestId==='string'&&typeof value.planId==='string'?value:null;}catch{return null;}}
export function checkoutIntent(storage,user,terms,uuid){const old=readCheckoutIntent(storage,user);if(old&&JSON.stringify([old.planId,old.paymentMethod,old.policyVersionId,old.promoCode,Boolean(old.singleMandate),Boolean(old.acceptRegularPriceFallback),old.switchFromSubscriptionId??null,old.retryOfAttemptId??null,old.priceChangeId??null,old.reactivateFromSubscriptionId??null])===JSON.stringify([terms.planId,terms.paymentMethod,terms.policyVersionId,terms.promoCode,Boolean(terms.singleMandate),Boolean(terms.acceptRegularPriceFallback),terms.switchFromSubscriptionId??null,terms.retryOfAttemptId??null,terms.priceChangeId??null,terms.reactivateFromSubscriptionId??null]))return old;const value={...terms,requestId:uuid()};try{storage.setItem(key(user),JSON.stringify(value));}catch{throw new Error('Checkout recovery storage is unavailable. Enable browser storage before continuing.');}return value;}
export function clearCheckoutIntent(storage,user,requestId){if(readCheckoutIntent(storage,user)?.requestId===requestId)storage.removeItem(key(user));}

export function adoptCheckoutRequest(storage,user,requestId){const old=readCheckoutIntent(storage,user);if(old&&/^[A-Za-z0-9_-]{16,100}$/.test(requestId))storage.setItem(key(user),JSON.stringify({...old,requestId}));}

// New terms get a new request; the server closes any verified unpaid older setup.
export async function checkoutIntentForPurchase(storage,user,terms,uuid){return checkoutIntent(storage,user,terms,uuid);}
