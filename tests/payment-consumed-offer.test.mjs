import test from 'node:test';
import assert from 'node:assert/strict';
import {providerMatches} from '../lib/billing/checkout-engine.mjs';
const notes={checkout_key:'request_001',ca_progress_user_id:'user1',ca_progress_policy_version_id:'pv1'};
const payload={plan_id:'plan_1',offer_id:'offer_1',total_count:12,quantity:1,notes};
const original={...payload,id:'sub_1',status:'created',paid_count:0};
const row={request_key:'request_001',user_id:'user1',payload_json:JSON.stringify(payload),contract_json:JSON.stringify({introCycles:1}),provider_snapshot_json:JSON.stringify(original)};
test('checkout accepts consumed offer only with its original provider proof',()=>{
 const active={...original,status:'active',paid_count:1,offer_id:null};
 assert.equal(providerMatches(row,active),true);
 assert.equal(providerMatches({...row,provider_snapshot_json:null},active),false);
 assert.equal(providerMatches(row,{...active,offer_id:'offer_other'}),false);
 assert.equal(providerMatches(row,{...active,paid_count:0}),false);
 assert.equal(providerMatches(row,{...active,status:'created'}),false);
 assert.equal(providerMatches(row,{...active,id:'sub_other'}),false);
 assert.equal(providerMatches(row,{...active,total_count:1200}),false);
 assert.equal(providerMatches(row,{...active,paid_count:undefined}),false);
});
