import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("P4 campaign checkout keeps pricing and Razorpay offer authority server-side",()=>{
  const client=read("components/billing/pricing-client.tsx");
  const worker=read("workers/billing/p4-final.ts");
  assert.match(client,/promoCode:promoCode\.trim\(\)\|\|undefined/);
  assert.doesNotMatch(client,/providerOfferId|offer_id|discountValue.*JSON\.stringify/);
  assert.match(worker,/provider_offer_id/);
  assert.match(worker,/offer_id:campaign\.campaign\.providerOfferId/);
  assert.match(worker,/billing_campaign_claims/);
});

test("P4 campaign winner is deterministic and first-N reservation remains D1-atomic",()=>{
  const worker=read("workers/billing/p4-final.ts");
  const sql=read("d1/migrations/0052_refinement_phase4_billing_operations_campaigns.sql");
  assert.match(worker,/lower\(cv\.promo_code\)=\?3/);
  assert.match(worker,/cv\.promo_code IS NULL/);
  assert.match(worker,/ORDER BY cv\.priority ASC,cv\.version DESC,cv\.id ASC/);
  assert.match(sql,/billing_campaign_claim_validate/);
  assert.match(sql,/cv\.first_n_limit IS NULL OR cv\.claimed_count<cv\.first_n_limit/);
  assert.match(sql,/cv\.max_redemptions IS NULL OR cv\.claimed_count<cv\.max_redemptions/);
});

test("P4 verifies discounted recurring charges against the internal campaign rule",()=>{
  const worker=read("workers/billing/p4-final.ts");
  assert.match(worker,/campaign_charge_amount_or_currency/);
  assert.match(worker,/payment\.amount!==expected/);
  assert.match(worker,/discount_cycles/);
  assert.match(worker,/financial_state='mismatch'/);
});

test("P4 preserves the existing recurring path when no eligible campaign applies",()=>{
  const worker=read("workers/billing/p4-final.ts");
  assert.match(worker,/if\(!campaign\)return p4Worker\.fetch/);
  assert.match(worker,/return p4Worker\.fetch\(request,env as never\)/);
  assert.match(worker,/p4Worker\.queue/);
  assert.match(worker,/p4Worker\.scheduled/);
});

test("P4 campaign provider failures release reserved inventory and cancel orphan subscriptions",()=>{
  const worker=read("workers/billing/p4-final.ts");
  assert.match(worker,/SET state='failed',failed_at/);
  assert.match(worker,/cancel_at_cycle_end:0/);
  assert.match(read("d1/migrations/0052_refinement_phase4_billing_operations_campaigns.sql"),/OLD\.state='reserved' AND NEW\.state IN \('failed','revoked'\)/);
});

test("billing deployment enters through the P4 closure worker and retains the final campaign worker",()=>{
  const config=read("workers/billing/wrangler.jsonc");
  const closure=read("workers/billing/p4-closure.ts");
  assert.match(config,/"main": "\.\/p4-closure\.ts"/);
  assert.match(closure,/import p4FinalWorker from "\.\/p4-final"/);
  assert.match(closure,/p4FinalWorker\.fetch/);
  assert.match(closure,/p4FinalWorker\.queue/);
  assert.match(closure,/p4FinalWorker\.scheduled/);
  assert.match(config,/ca-progress-v2-billing-ops/);
  assert.match(config,/15 \* \* \* \*/);
});
