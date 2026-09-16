import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const text = (value) => String(value ?? "").trim();
const required = (name) => {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const fingerprint = (value) => createHash("sha256").update(text(value)).digest("hex").slice(0, 12);

function parseDatabaseConfig(configText) {
  const name = configText.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  const id = configText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if (!name || !id) throw new Error("Could not resolve Billing Worker D1 configuration.");
  return { name, id };
}

export const pricingReadinessSql = `SELECT sp.tier_key,sp.checkout_enabled,pv.price_subunits,pv.currency,pv.billing_duration_value,pv.billing_duration_unit
FROM subscription_plans sp
JOIN plan_policy_versions pv ON pv.id=(
  SELECT active.id FROM plan_policy_versions active
  WHERE active.plan_id=sp.id AND active.state='published'
    AND (active.effective_at IS NULL OR active.effective_at<=CURRENT_TIMESTAMP)
  ORDER BY COALESCE(active.effective_at,active.published_at,active.created_at) DESC,active.version DESC
  LIMIT 1
)
WHERE sp.active=1 AND sp.billing_cycle='monthly' AND sp.tier_key IN ('basic','pro')
ORDER BY sp.rank`;

export const candidateSql = `SELECT ch.provider_payment_id,ch.provider_subscription_id,ch.captured_at
FROM razorpay_subscription_charges ch
JOIN razorpay_subscriptions rs ON rs.id=ch.razorpay_subscription_id
WHERE ch.status='captured' AND rs.provider_verified=1
ORDER BY COALESCE(ch.captured_at,ch.updated_at) DESC
LIMIT 1`;

async function queryD1(accountId, apiToken, databaseId, sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sql, params: [] }),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok || data?.success === false) throw new Error(data?.errors?.[0]?.message || `Cloudflare D1 query failed (${response.status}).`);
  const result = Array.isArray(data?.result) ? data.result[0] : data?.result;
  return Array.isArray(result?.results) ? result.results : [];
}

function summarizePricing(rows) {
  return rows.map((row) => ({
    tier: text(row.tier_key),
    checkout_enabled: Number(row.checkout_enabled) === 1,
    recurring_price_subunits: Number(row.price_subunits ?? 0),
    currency: text(row.currency),
    interval: `${Number(row.billing_duration_value ?? 0)} ${text(row.billing_duration_unit)}`,
  }));
}

function assertPricingReady(rows) {
  const summary = summarizePricing(rows);
  for (const tier of ["basic", "pro"]) {
    const plan = summary.find((row) => row.tier === tier);
    if (!plan) throw new Error(`Production monthly ${tier} plan is missing.`);
    if (!plan.checkout_enabled) throw new Error(`Production monthly ${tier} checkout is disabled.`);
    if (plan.recurring_price_subunits < 100) throw new Error(`Production monthly ${tier} published price is below ₹1.`);
    if (plan.currency !== "INR") throw new Error(`Production monthly ${tier} currency is not INR.`);
    if (plan.interval !== "1 month") throw new Error(`Production monthly ${tier} billing interval is not 1 month.`);
  }
  return summary;
}

async function writeEvidence(database, result, reason, pricing) {
  const outputPath = resolve(process.env.CA_BILLING_CERT_EVIDENCE_PATH || "deployment-evidence/billing-phase-a.json");
  const evidence = {
    schema_version: 2,
    phase: "A",
    result,
    checked_at: new Date().toISOString(),
    git_sha: text(process.env.GITHUB_SHA) || null,
    mode: "razorpay-live",
    database: { name: database.name, id_fingerprint: fingerprint(database.id) },
    pricing,
    provider: { subscription_id: "—", payment_id: "—" },
    pending_reason: reason,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const summaryPath = text(process.env.GITHUB_STEP_SUMMARY);
  if (summaryPath) {
    const readiness = pricing.map((plan) => `- ${plan.tier}: ${plan.checkout_enabled ? "enabled" : "disabled"}, ${plan.recurring_price_subunits} subunits ${plan.currency}, ${plan.interval}`).join("\n");
    await appendFile(summaryPath, [
      "## Billing Phase A — production certification",
      "",
      `**Result:** ${result === "pending" ? "⏳ PENDING LIVE TRANSACTION" : "🚫 BLOCKED"}`,
      `**Checked:** ${evidence.checked_at}`,
      `**Commit:** \`${evidence.git_sha || "unknown"}\``,
      `**Database:** \`${database.name}\``,
      "",
      "### Production pricing readiness",
      readiness || "- No paid monthly plans returned.",
      "",
      reason,
      "",
      "No payment was created or mutated by this workflow.",
      "",
    ].join("\n"), "utf8");
  }
}

async function main() {
  const configPath = resolve(process.env.CA_BILLING_WRANGLER_CONFIG || "workers/billing/wrangler.jsonc");
  const database = parseDatabaseConfig(await readFile(configPath, "utf8"));
  const accountId = required("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = required("CLOUDFLARE_API_TOKEN");

  const pricingRows = await queryD1(accountId, apiToken, database.id, pricingReadinessSql);
  let pricing;
  try {
    pricing = assertPricingReady(pricingRows);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Production paid pricing is not checkout-ready.";
    await writeEvidence(database, "blocked", reason, summarizePricing(pricingRows));
    throw error;
  }

  let subscriptionId = text(process.env.CA_BILLING_CERT_SUBSCRIPTION_ID);
  let paymentId = text(process.env.CA_BILLING_CERT_PAYMENT_ID);

  if (!subscriptionId || !paymentId) {
    const rows = await queryD1(accountId, apiToken, database.id, candidateSql);
    const candidate = rows[0];
    subscriptionId = text(candidate?.provider_subscription_id);
    paymentId = text(candidate?.provider_payment_id);
    if (!subscriptionId || !paymentId) {
      const reason = "Paid monthly pricing is checkout-ready, but no provider-verified captured recurring Razorpay charge exists in production D1 yet. Complete one normal live checkout before the Phase A exit gate can pass.";
      await writeEvidence(database, "pending", reason, pricing);
      console.log(`Billing Phase A remains pending: ${reason}`);
      return;
    }
  }

  const child = spawnSync(process.execPath, [resolve("scripts/certify-billing-production.mjs")], {
    stdio: "inherit",
    env: { ...process.env, CA_BILLING_CERT_SUBSCRIPTION_ID: subscriptionId, CA_BILLING_CERT_PAYMENT_ID: paymentId },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exitCode = child.status ?? 1;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Automatic Billing Phase A certification failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
