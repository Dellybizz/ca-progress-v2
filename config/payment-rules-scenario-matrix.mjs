const groups=[
 [[1,2],'tests/checkout-retry-arbitration.test.mjs'],
 [[3,4,5,18,21,22,23,28,29,30,31,42],'tests/owner-renewal-rules.test.mjs'],
 [[6,19,20,32,33,41],'tests/subscription-switch.test.mjs'],
 [[7,8,9,10,11,12,44,45,46],'tests/owner-storage-cleanup.test.mjs'],
 [[13,14,15,16,17,24,25,26,27,38,39,40],'tests/owner-commercial-rules.test.mjs'],
 [[34,35,36,37,47],'tests/recurring-gifts.test.mjs'],
 [[43],'tests/payment-system-p1.test.mjs'],
];
export const scenarioMatrix=groups.flatMap(([ids,testFile])=>ids.map(id=>({id,testFile,evidenceKind:id===43?'policy_and_provider_documentation':'automated_provider_fixture',liveBankProof:'pending'}))).sort((a,b)=>a.id-b.id);
export const releaseTests=[...new Set([...scenarioMatrix.map(s=>s.testFile),'tests/payment-system-p3-worker.test.mjs','tests/payment-system-p3.test.mjs','tests/single-mandate-fallback.test.mjs','tests/payment-prepaid-access.test.mjs','tests/payment-system-p5.test.mjs','tests/checkout-retry-migration.test.mjs'])];
