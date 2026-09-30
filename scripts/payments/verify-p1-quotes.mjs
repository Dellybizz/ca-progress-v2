import {mkdir,writeFile} from 'node:fs/promises';
const base='https://ca-progress-v2.habeebaasif622.workers.dev';
const evidence=[];
for(const method of ['upi','card','emandate']){
  const response=await fetch(`${base}/api/v1/payments/quote?method=${method}`,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Live quote failed: ${response.status}`);
  const data=await response.json();if(!Array.isArray(data.quotes)||!data.quotes.length)throw new Error('Live quotes missing');
  for(const quote of data.quotes){if(quote.paymentMethod!==method||quote.currency!=='INR'||!quote.policyVersionId)throw new Error('Invalid live quote');if(method!=='upi'&&(quote.introApplied||quote.firstChargeSubunits!==quote.recurringPriceSubunits))throw new Error('UPI-only discount leaked to another method');if(quote.tierKey!=='free'&&!quote.checkoutReady)throw new Error(`Live ${quote.tierKey} ${quote.billingCycle} mapping/offer is not ready`);evidence.push({method,tier:quote.tierKey,cycle:quote.billingCycle,firstChargeSubunits:quote.firstChargeSubunits,recurringPriceSubunits:quote.recurringPriceSubunits,checkoutReady:quote.checkoutReady});}
}
await mkdir('deployment-evidence/payment-system-p1',{recursive:true});await writeFile('deployment-evidence/payment-system-p1/live-quotes.json',JSON.stringify({checked_at:new Date().toISOString(),quotes:evidence},null,2));console.log(JSON.stringify({live_quotes_checked:evidence.length}));
