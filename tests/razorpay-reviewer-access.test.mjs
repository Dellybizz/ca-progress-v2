import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("0056 provisions one expiring student-only reviewer credential",()=>{
  const sql=read("d1/migrations/0056_razorpay_reviewer_access.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS reviewer_credentials/);
  assert.match(sql,/password_salt/);
  assert.match(sql,/password_hash/);
  assert.match(sql,/password_iterations/);
  assert.match(sql,/razorpay-reviewer/);
  assert.match(sql,/'student'/);
  assert.match(sql,/expires_at/);
  assert.doesNotMatch(sql,/'admin'|'owner'|'moderator'/);
  const retained=read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(retained,/0056_razorpay_reviewer_access\.sql/);
  assert.match(retained,/0057_razorpay_reviewer_password_rotation\.sql/);
  assert.match(retained,/BETWEEN '0012' AND '0057'/);
});

test("reviewer login uses normal server sessions with PBKDF2 and lockout",()=>{
  const auth=read("lib/auth/reviewer.ts");
  const shared=read("lib/auth/cloudflare.ts");
  assert.match(auth,/signInRazorpayReviewer/);
  assert.match(auth,/pbkdf2Sync/);
  assert.match(auth,/node:crypto/);
  assert.match(auth,/sha256/);
  assert.doesNotMatch(auth,/crypto\.subtle\.deriveBits\([\s\S]*PBKDF2/);
  assert.match(auth,/timingSafeEqual/);
  assert.match(auth,/failed_attempts/);
  assert.match(auth,/locked_until/);
  assert.match(auth,/15 \* 60 \* 1000/);
  assert.match(auth,/issueRazorpayReviewerSession\(row\.application_user_id/);
  assert.match(shared,/issueRazorpayReviewerSession/);
});

test("reviewer route is POST-only and same-origin",()=>{
  const route=read("app/auth/reviewer/route.ts");
  assert.match(route,/export async function POST/);
  assert.match(route,/sameOrigin/);
  assert.match(route,/reviewer_auth_failed/);
  assert.match(route,/signInRazorpayReviewer/);
  assert.match(route,/runtime = "nodejs"/);
  assert.doesNotMatch(route,/export async function GET/);
});

test("login page exposes explicit reviewer credentials fields without changing OAuth links",()=>{
  const panel=read("components/auth/login-panel.tsx");
  assert.match(panel,/Continue with Google/);
  assert.match(panel,/Continue with LinkedIn/);
  assert.match(panel,/Reviewer username/);
  assert.match(panel,/Reviewer password/);
  assert.match(panel,/action="\/auth\/reviewer"/);
  assert.match(panel,/Reviewer sign in/);
});
