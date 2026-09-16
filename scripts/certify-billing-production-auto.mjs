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
const unixIso = (value) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
};

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

export const pendingSubscriptionSql = `SELECT
  rs.provider_subscription_id,
  rs.status,
  rs.financial_state,
  rs.auth_attempts,
  rs.provider_verified,
  rs.created_at,
  rs.updated_at,
  (
    SELECT e.event_type
    FROM razorpay_subscription_events e
    WHERE e.provider_subscription_id=rs.provider_subscription_id
    ORDER BY COALESCE(e.provider_created_at,e.received_at) DESC,e.received_at DESC
    LIMIT 1
  ) AS latest_event_type,
  (
    SELECT e.outcome
    FROM razorpay_subscription_events e
    WHERE e.provider_subscription_id=rs.provider_subscription_id
    ORDER BY COALESCE(e.provider_created_at,e.received_at) DESC,e.received_at DESC
    LIMIT 1
  ) AS latest_event_outcome,
  (
    SELECT e.error_code
    FROM razorpay_subscription_events e
    WHERE e.provider_subscription_id=rs.provider_subscription_id
    ORDER BY COALESCE(e.provider_created_at,e.received_at) DESC,e.received_at DESC
    LIMIT 1
  ) AS latest_event_error
FROM razorpay_subscriptions rs
WHERE rs.status IN ('created','authenticated','pending','halted')
  AND rs.financial_state IN ('unpaid','failed')
ORDER BY rs.created_at DESC
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

async function fetchProviderSubscription(subscriptionId) {
  const keyId = required("RAZORPAY_KEY_ID");
  const keySecret = required("RAZORPAY_KEY_SECRET");
  const authorization = Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: { authorization: `Basic ${authorization}`, accept: "application/json" },
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    return {
      fetch_ok: false,
      http_status: response.status,
      error_code: text(data?.error?.code) || null,
    };
  }
  const expireBy = Number(data?.expire_by ?? 0);
  return {
    fetch_ok: true,
    id_fingerprint: fingerprint(data?.id),
    plan_id_fingerprint: fingerprint(data?.plan_id),
    status: text(data?.status) || null,
    auth_attempts: Number(data?.auth_attempts ?? 0),
    total_count: Number(data?.total_count ?? 0),
    paid_count: Number(data?.paid_count ?? 0),
    remaining_count: data?.remaining_count == null ? null : Number(data.remaining_count),
    customer_notify: Boolean(data?.customer_notify),
    created_at: unixIso(data?.created_at),
    start_at: unixIso(data?.start_at),
    charge_at: unixIso(data?.charge_at),
    expire_by: unixIso(data?.expire_by),
    authorization_expired: expireBy > 0 ? expireBy * 1000 <= Date.now() : false,
    short_url_present: Boolean(text(data?.short_url)),
    offer_linked: Boolean(text(data?.offer_id)),
    has_scheduled_changes: Boolean(data?.has_scheduled_changes),
    source: text(data?.source) || null,
  };
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

async function checkoutDiagnostic(accountId, apiToken, databaseId) {
  const rows = await queryD1(accountId, apiToken, databaseId, pendingSubscriptionSql);
  const row = rows[0];
  const subscriptionId = text(row?.provider_subscription_id);
  if (!subscriptionId) return null;

  let providerState;
  try {
    providerState = await fetchProviderSubscription(subscriptionId);
  } catch (error) {
    providerState = {
      fetch_ok: false,
      error_code: error instanceof Error ? "provider_fetch_exception" : "provider_fetch_failed",
    };
  }

  return {
    local: {
      provider_subscription_fingerprint: fingerprint(subscriptionId),
      status: text(row?.status) || null,
      financial_state: text(row?.financial_state) || null,
      auth_attempts: Number(row?.auth_attempts ?? 0),
      provider_verified: Number(row?.provider_verified) === 1,
      created_at: text(row?.created_at) || null,
      updated_at: text(row?.updated_at) || null,
      latest_event_type: text(row?.latest_event_type) || null,
      latest_event_outcome: text(row?.latest_event_outcome) || null,
      latest_event_error: text(row?.latest_event_error) || null,
    },
    provider: providerState,
  };
}

function diagnosticSummary(diagnostic) {
  if (!diagnostic) return ["- No open recurring subscription attempt is stored in production D1."];
  const provider = diagnostic.provider ?? {};
  return [
    `- Local state: ${diagnostic.local?.status || "unknown"} / ${diagnostic.local?.financial_state || "unknown"}; auth attempts ${diagnostic.local?.auth_attempts ?? 0}; verified ${diagnostic.local?.provider_verified ? "yes" : "no"}.`,
    provider.fetch_ok
      ? `- Razorpay state: ${provider.status || "unknown"}; auth attempts ${provider.auth_attempts ?? 0}; auth expiry ${provider.expire_by || "not set"}; expired ${provider.authorization_expired ? "yes" : "no"}.`
      : `- Razorpay fetch: unavailable${provider.http_status ? ` (HTTP ${provider.http_status})` : ""}${provider.error_code ? `, ${provider.error_code}` : ""}.`,
    provider.fetch_ok ? `- Razorpay authorisation link present: ${provider.short_url_present ? "yes" : "no"}; offer linked: ${provider.offer_linked ? "yes" : "no"}.` : null,
    diagnostic.local?.latest_event_type
      ? `- Latest billing event: ${diagnostic.local.latest_event_type} / ${diagnostic.local.latest_event_outcome || "unknown"}${diagnostic.local.latest_event_error ? ` / ${diagnostic.local.latest_event_error}` : ""}.`
      : "- No provider billing event has been recorded for this attempt yet.",
  ].filter(Boolean);
}

async function writeEvidence(database, result, reason, pricing, diagnostic = null) {
  const outputPath = resolve(process.env.CA_BILLING_CERT_EVIDENCE_PATH || "deployment-evidence/billing-phase-a.json");
  const evidence = {
    schema_version: 3,
    phase: "A",
    result,
    checked_at: new Date().toISOString(),
    git_sha: text(process.env.GITHUB_SHA) || null,
    mode: "razorpay-live",
    database: { name: database.name, id_fingerprint: fingerprint(database.id) },
    pricing,
    checkout_diagnostic: diagnostic,
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
      "### Latest open checkout diagnostic",
      ...diagnosticSummary(diagnostic),
      "",
      reason,
      "",
      "No payment, subscription or entitlement was created or mutated by this workflow.",
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
      const diagnostic = await checkoutDiagnostic(accountId, apiToken, database.id);
      let reason = "Paid monthly pricing is checkout-ready, but no provider-verified captured recurring Razorpay charge exists in production D1 yet.";
      if (diagnostic?.provider?.fetch_ok && diagnostic.provider.authorization_expired) {
        reason += " The latest provider subscription authorization window is expired, so a new checkout subscription is required.";
      } else if (diagnostic?.provider?.fetch_ok && diagnostic.provider.short_url_present && diagnostic.provider.status === "created") {
        reason += " The latest Razorpay subscription is still authorisable and has a provider authorisation link, so a QR refresh failure is not caused by an expired CA Progress subscription.";
      }
      await writeEvidence(database, "pending", reason, pricing, diagnostic);
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
