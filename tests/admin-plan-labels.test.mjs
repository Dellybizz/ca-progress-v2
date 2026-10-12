import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredPlanLabel} from '../lib/billing/plan-policy.mjs';

test('admin configured names take priority over tier defaults',()=>{
  assert.equal(configuredPlanLabel('pro','  Achiever  '),'Achiever');
  assert.equal(configuredPlanLabel('basic','Basic'),'Basic');
  assert.equal(configuredPlanLabel('free','Getting started'),'Getting started');
});
test('missing or empty admin names fall back to product defaults',()=>{
  assert.equal(configuredPlanLabel('free'),'Explorer');
  assert.equal(configuredPlanLabel('basic',' '),'Striver');
  assert.equal(configuredPlanLabel('pro',null),'Ranker');
});
