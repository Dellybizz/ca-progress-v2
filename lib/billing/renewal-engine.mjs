// Only provider reads are permitted here. Razorpay owns debits, retries and notifications.
const iso=n=>new Date(Number(n)*1000).toISOString();
export class RenewalError extends Error{constructor(message,code='renewal_evidence_pending'){super(message);this.code=code;}}
export function expectedCycleAmount(contract,number){if(!Number.isSafeInteger(number)||number<1)throw new RenewalError('Invalid billing cycle.','renewal_invoice_mismatch');const regular=Number(contract.recurring_price_subunits),first=Number(contract.initial_price_subunits),discountCycles=Number(contract.discount_cycles??contract.intro_billing_cycles??0);if(!Number.isSafeInteger(regular)||regular<100||!Number.isSafeInteger(first)||first<100)throw new RenewalError('Contracted pricing is invalid.','renewal_contract_mismatch');return contract.provider_offer_id&&number<=discountCycles?first:regular;}
export function invoiceCycles(invoices,subscriptionId){
 const unique=new Map();
 for(const invoice of invoices){if(!/^inv_[A-Za-z0-9]+$/.test(String(invoice.id))||invoice.subscription_id!==subscriptionId)throw new RenewalError('Invoice ownership could not be verified.','renewal_invoice_mismatch');if(unique.has(invoice.id)&&JSON.stringify(unique.get(invoice.id))!==JSON.stringify(invoice))throw new RenewalError('Conflicting invoice snapshots.','renewal_invoice_mismatch');unique.set(invoice.id,invoice);}
 const rows=[...unique.values()].filter(i=>i.status!=='draft');
 for(const i of rows)if(!Number.isSafeInteger(Number(i.billing_start))||Number(i.billing_start)<=0||!Number.isSafeInteger(Number(i.billing_end))||Number(i.billing_end)<=Number(i.billing_start))throw new RenewalError('Invoice service dates are unavailable.');
 rows.sort((a,b)=>Number(a.billing_start)-Number(b.billing_start)||String(a.id).localeCompare(String(b.id)));
 for(let n=1;n<rows.length;n++)if(Number(rows[n].billing_start)<Number(rows[n-1].billing_end))throw new RenewalError('Overlapping provider invoice periods.','renewal_invoice_mismatch');
 return rows.map((invoice,n)=>({...invoice,cycleNumber:n+1}));
}
export function verifyCycle(contract,invoice,payment){
 const expected=expectedCycleAmount(contract,invoice.cycleNumber),identity=invoice.subscription_id===contract.provider_subscription_id&&payment?.id===invoice.payment_id&&payment?.invoice_id===invoice.id&&(payment?.subscription_id==null||payment.subscription_id===invoice.subscription_id);
 if((contract.checkout_payment_method&&payment?.method!==contract.checkout_payment_method)||(contract.provider_offer_id&&payment?.method!=='upi'))throw new RenewalError('Payment method differs from the authorized offer.','renewal_method_mismatch');
 if(!identity)throw new RenewalError('Payment and invoice identity do not agree.','renewal_payment_mismatch');
 if(invoice.status!=='paid'||payment.status!=='captured')throw new RenewalError('A captured invoice payment is not yet verified.');
 if(payment.amount!==expected||invoice.amount!==expected||invoice.amount_paid!==expected||Number(invoice.amount_due)!==0||payment.currency!==contract.currency||invoice.currency!==contract.currency)throw new RenewalError('Invoice amount differs from the saved commercial contract.','renewal_amount_mismatch');
 if(Number(payment.amount_refunded??0)>=expected)return {expected,status:'refunded'};
 return {expected,status:'verified'};
}
export async function collectRenewalEvidence(db,contract,subscription,provider,{keyId='',callbackPayment=null}={}){
 if(subscription.id!==contract.provider_subscription_id||subscription.plan_id!==contract.recurring_provider_plan_id||String(subscription.offer_id??'')!==String(contract.provider_offer_id??''))throw new RenewalError('The original plan or offer changed.','renewal_contract_mismatch');
 if(callbackPayment&&((callbackPayment.subscription_id&&callbackPayment.subscription_id!==subscription.id)||(contract.checkout_payment_method&&callbackPayment.method!==contract.checkout_payment_method)||(contract.provider_offer_id&&callbackPayment.method!=='upi')))throw new RenewalError('Authorization payment method or ownership differs from the saved checkout.','renewal_method_mismatch');
 if(contract.total_count!=null&&(Number(subscription.total_count)!==Number(contract.total_count)||Number(subscription.quantity??1)!==1))throw new RenewalError('Mandate quantity or cycle limit changed.','renewal_contract_mismatch');
 if(contract.mandate_schedule_version==='p3-one-year-v1'&&subscription.customer_notify!==true&&subscription.customer_notify!==1)throw new RenewalError('Provider mandate notifications are not enabled.','renewal_contract_mismatch');
 const paidCount=Number(subscription.paid_count??0);if(!Number.isSafeInteger(paidCount)||paidCount<0)throw new RenewalError('Provider paid count is invalid.');
 if(paidCount===0&&!callbackPayment?.invoice_id){return {paidCount:0,paidThrough:contract.paid_through_at??null,latestPaidStart:null,authorizationOnly:Boolean(callbackPayment),firstCycleVerified:false,fullCycleVerified:false};}
 const invoices=[];let complete=false;
 for(let page=0;page<15;page++){const result=await provider(`invoices?subscription_id=${encodeURIComponent(subscription.id)}&count=100&skip=${page*100}`);if(!Array.isArray(result.items))throw new RenewalError('Provider invoice inventory is unavailable.');invoices.push(...result.items);if(result.items.length<100){complete=true;break;}}
 if(!complete)throw new RenewalError('Provider invoice inventory requires bounded reconciliation.');
 const cycles=invoiceCycles(invoices,subscription.id),verified=[],writes=[],now=new Date().toISOString();
 if(callbackPayment?.invoice_id&&!cycles.some(i=>i.id===callbackPayment.invoice_id))throw new RenewalError('Callback invoice is absent from provider inventory.');
 for(const invoice of cycles){
  const expected=expectedCycleAmount(contract,invoice.cycleNumber);let status='pending',payment=null;
  if(invoice.status==='paid'){
   if(!/^pay_[A-Za-z0-9]+$/.test(String(invoice.payment_id)))throw new RenewalError('Paid invoice has no valid payment reference.');
   payment=await provider(`payments/${encodeURIComponent(invoice.payment_id)}`);
   const verdict=verifyCycle(contract,invoice,payment);status=verdict.status;if(status==='verified')verified.push({invoice,payment});
  }
  // Conflict never rewrites a cycle's identity or accepted price.
  const stored=await db.prepare('SELECT * FROM payment_subscription_cycles WHERE provider_invoice_id=?1').bind(invoice.id).first();
  if(stored&&(stored.provider_subscription_id!==subscription.id||Number(stored.cycle_number)!==invoice.cycleNumber||stored.starts_at!==iso(invoice.billing_start)||stored.ends_at!==iso(invoice.billing_end)||Number(stored.expected_amount_subunits)!==expected))throw new RenewalError('Saved invoice identity has changed.','renewal_invoice_mismatch');
  writes.push(db.prepare(`INSERT INTO payment_subscription_cycles(provider_invoice_id,razorpay_subscription_id,provider_subscription_id,cycle_number,provider_payment_id,starts_at,ends_at,expected_amount_subunits,amount_subunits,currency,status,payment_method,provider_mode,verified_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) ON CONFLICT(provider_invoice_id) DO UPDATE SET provider_payment_id=excluded.provider_payment_id,amount_subunits=excluded.amount_subunits,status=excluded.status,payment_method=excluded.payment_method,verified_at=excluded.verified_at,updated_at=excluded.updated_at`).bind(invoice.id,contract.id,subscription.id,invoice.cycleNumber,payment?.id??null,iso(invoice.billing_start),iso(invoice.billing_end),expected,Number(invoice.amount??0),String(invoice.currency??''),status,payment?.method??null,keyId.startsWith('rzp_live_')?'live':'test',status==='verified'?now:null,now));
  if(payment)writes.push(db.prepare(`INSERT INTO razorpay_subscription_charges(provider_payment_id,razorpay_subscription_id,provider_subscription_id,provider_invoice_id,amount_subunits,currency,status,provider_created_at,captured_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(provider_payment_id) DO UPDATE SET status=excluded.status,captured_at=COALESCE(excluded.captured_at,razorpay_subscription_charges.captured_at),updated_at=excluded.updated_at`).bind(payment.id,contract.id,subscription.id,invoice.id,payment.amount,payment.currency,payment.status,iso(payment.created_at),iso(payment.captured_at??payment.created_at),now));
 }
 // paid_count is not permission to grant an unobserved period.
 const captured=cycles.filter(i=>i.status==='paid').length;
 if(captured<paidCount)throw new RenewalError('Provider paid cycles are not fully evidenced.');
 for(let n=0;n<writes.length;n+=50){const results=await db.batch(writes.slice(n,n+50));if(results.some(r=>r.success===false))throw new RenewalError('Verified cycles could not be persisted.');}
 const anchor=verified.filter(v=>Number(v.invoice.billing_start)<=Date.now()/1000).at(-1)??verified[0];let coverageEnd=anchor?.invoice.billing_end;
 if(anchor){const index=verified.indexOf(anchor);for(const next of verified.slice(index+1)){if(Number(next.invoice.billing_start)!==Number(coverageEnd))break;coverageEnd=next.invoice.billing_end;}}
 const discountCycles=Number(contract.discount_cycles??contract.intro_billing_cycles??0);
 return {paidCount:verified.length,paidThrough:anchor?iso(coverageEnd):contract.paid_through_at??null,latestPaidStart:anchor?iso(anchor.invoice.billing_start):null,authorizationOnly:Boolean(callbackPayment&&!callbackPayment.invoice_id),firstCycleVerified:verified.some(v=>v.invoice.cycleNumber===1),fullCycleVerified:verified.some(v=>v.invoice.cycleNumber>discountCycles)};
}
