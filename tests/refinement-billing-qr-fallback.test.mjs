import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("billing worker exposes only a provider-owned secure authorization fallback",()=>{
  const worker=read("workers/billing/p4-closure.ts");
  assert.match(worker,/api\.razorpay\.com\/v1\/subscriptions/);
  assert.match(worker,/short_url/);
  assert.match(worker,/url\.protocol === "https:"/);
  assert.match(worker,/url\.hostname === "rzp\.io"/);
  assert.match(worker,/url\.hostname\.endsWith\("\.razorpay\.com"\)/);
  assert.match(worker,/authorizationUrl/);
  assert.match(worker,/cache-control", "private, no-store"/);
  assert.match(worker,/JSON\.stringify\(\{ \.\.\.payload, authorizationUrl \}\)/);
});

test("pricing retries bypass a stuck embedded QR without creating a second subscription",()=>{
  const client=read("components/billing/pricing-client.tsx");
  assert.match(client,/created\.reused&&authorizationUrl/);
  assert.match(client,/window\.location\.assign\(authorizationUrl\)/);
  assert.match(client,/setFallbackUrl\(authorizationUrl\)/);
  assert.match(client,/UPI QR not loading\?/);
  assert.match(client,/Open Razorpay secure page/);
  assert.match(client,/rel="noopener noreferrer"/);
});

test("web checkout retry uses Razorpay-supported web option shape",()=>{
  const client=read("components/billing/pricing-client.tsx");
  assert.match(client,/retry:\{enabled:true\}/);
  assert.doesNotMatch(client,/max_count/);
});
