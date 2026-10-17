import test from 'node:test';
import assert from 'node:assert/strict';
import {billingOverviewSubscription} from '../lib/billing/pricing-state.mjs';
const setup={planId:'striver-annual',status:'cancelled',paidCount:0,paidThroughAt:null,trialDays:0};
test('cancelled unpaid setup does not supply Explorer pricing or mandate approval',()=>{
 assert.equal(billingOverviewSubscription(setup,'explorer'),null);
 assert.equal(billingOverviewSubscription(setup,setup.planId),null);
 for(const status of ['created','authenticated','pending','active'])assert.equal(billingOverviewSubscription({...setup,status},setup.planId),null);
});
test('a cancelled paid subscription retains controls through its paid access period',()=>{
 const paid={...setup,paidCount:1,paidThroughAt:'2027-01-01'};
 assert.equal(billingOverviewSubscription(paid,paid.planId),paid);
 assert.equal(billingOverviewSubscription(paid,'explorer'),null);
});
test('matching trials, paid upgrade access and gifts retain renewal information',()=>{
 for(const changes of [{status:'active',trialDays:7},{paidThroughAt:'2027-01-01'},{upgradeRenewalApproved:true},{paidCount:1,giftId:'gift-1'}]){
 const subscription={...setup,...changes};assert.equal(billingOverviewSubscription(subscription,subscription.planId),subscription);
 }
 assert.equal(billingOverviewSubscription(null,'explorer'),null);
});
