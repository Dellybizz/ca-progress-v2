import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedPlanCacheMatches} from '../lib/billing/verified-plan-cache.mjs';
const now=Date.now(),terms={keyId:'rzp_live_fixture',planId:'plan_1',amount:5000,currency:'INR',period:'monthly',interval:1,now};
const snapshot={keyId:terms.keyId,id:terms.planId,amount:terms.amount,currency:terms.currency,period:terms.period,interval:terms.interval};
test('only a recent exact provider snapshot for the current Razorpay key can skip Plan GET',()=>{
 const row={provider_snapshot_json:JSON.stringify(snapshot),last_checked_at:new Date(now-1000).toISOString()};assert.equal(verifiedPlanCacheMatches(row,terms),true);
 for(const patch of [{keyId:'rzp_test_other'},{planId:'plan_other'},{amount:15000},{currency:'USD'},{period:'yearly'},{interval:2}])assert.equal(verifiedPlanCacheMatches(row,{...terms,...patch}),false);
 for(const patch of [{provider_snapshot_json:'{}'},{provider_snapshot_json:'broken'},{last_checked_at:new Date(now-300000).toISOString()},{last_checked_at:new Date(now+1000).toISOString()},{last_checked_at:null}])assert.equal(verifiedPlanCacheMatches({...row,...patch},terms),false);
});
