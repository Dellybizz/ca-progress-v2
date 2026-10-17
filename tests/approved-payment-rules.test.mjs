import test from 'node:test';
import assert from 'node:assert/strict';
import {graceDays,recoveryWindow,quoteStillValid,introductoryEligible,consumesIntroductoryOffer,latePaymentDecision} from '../lib/billing/approved-rules.mjs';
test('monthly and annual access end exactly at owner-selected grace boundaries',()=>{
  for(const [cycle,end,recovery] of [['monthly','2026-10-04','2026-10-11'],['annual','2026-10-11','2026-10-18']]){
    const input={cycle,paidThroughAt:'2026-10-01T00:00:00Z',now:end+'T00:00:00Z'};
    assert.equal(recoveryWindow(input).access,false);
    assert.equal(recoveryWindow(input).recover,true);
    assert.equal(recoveryWindow({...input,now:recovery+'T00:00:00Z'}).recover,false);
    assert.equal(recoveryWindow({...input,cancelled:true}).recover,false);
  }
  assert.equal(graceDays('monthly','lower_price_approval'),10);
  assert.throws(()=>graceDays('weekly'));
});
test('quote expires at thirty minutes and future timestamps cannot extend it',()=>{
  assert.equal(quoteStillValid('2026-10-01T00:00:00Z','2026-10-01T00:29:59Z'),true);
  assert.equal(quoteStillValid('2026-10-01T00:00:00Z','2026-10-01T00:30:00Z'),false);
  assert.equal(quoteStillValid('2026-10-02T00:00:00Z','2026-10-01T00:00:00Z'),false);
});
test('only verified captured discounted purchases consume student-wide introductory eligibility',()=>{
  assert.equal(consumesIntroductoryOffer({verified:true,captured:true,discounted:false}),false);
  assert.equal(consumesIntroductoryOffer({verified:false,captured:true,discounted:true}),false);
  assert.equal(consumesIntroductoryOffer({verified:true,captured:true,discounted:true,refunded:true}),true);
  assert.equal(introductoryEligible({cycle:'monthly',consumed:true}),false);
  assert.equal(introductoryEligible({cycle:'annual'}),false);
  assert.equal(introductoryEligible({cycle:'monthly',gifted:true}),false);
  assert.equal(introductoryEligible({cycle:'monthly'}),true);
});
test('late payment never creates a fresh period and cancellation refund takes precedence',()=>{
  const input={confirmedAt:'2026-11-02T00:00:00Z',periodEnd:'2026-11-01T00:00:00Z'};
  assert.equal(latePaymentDecision(input),'retain_expired_period');
  assert.equal(latePaymentDecision({...input,cancelledDuringGrace:true}),'full_refund');
});
