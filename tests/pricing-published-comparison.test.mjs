import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedComparisonValue } from '../lib/billing/plan-comparison.mjs';
const rule = (values = {}) => ({ feature_key:'study_timer', enabled:true, limit_value:null, limit_unit:'unlimited', reset_period:'never', ...values });
test('comparison follows published access without tier defaults', () => {
  assert.equal(publishedComparisonValue(undefined),'—');
  assert.equal(publishedComparisonValue(rule()),'Included');
  assert.equal(publishedComparisonValue(rule({enabled:false})),'—');
});
test('storage edits, zero and unlimited do not use fixed tier quotas', () => {
  assert.equal(publishedComparisonValue(rule({feature_key:'resources.storage'})),'Unlimited');
  assert.equal(publishedComparisonValue(rule({limit_value:0,limit_unit:'megabytes'})),'0 MB');
  assert.equal(publishedComparisonValue(rule({limit_value:750,limit_unit:'megabytes'})),'750 MB');
  assert.equal(publishedComparisonValue(rule({limit_value:4096,limit_unit:'megabytes'})),'4 GB');
});
test('published quantity and time limits appear with their reset period', () => {
  assert.equal(publishedComparisonValue(rule({limit_value:5,limit_unit:'count',reset_period:'monthly'})),'5 / monthly');
  assert.equal(publishedComparisonValue(rule({limit_value:30,limit_unit:'minutes',reset_period:'daily'})),'30 min / daily');
});
