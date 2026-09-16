import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const text = (value) => String(value ?? "").trim();
const number = (value) => Number(value ?? 0);
const required = (name, env = process.env) => {
  const value = text(env[name]);
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const mask = (value) => {
  const valueText = text(value);
  if (!valueText) return "—";
  if (valueText.length <= 10) return `${valueText.slice(0, 3)}…`;
  return `${valueText.slice(0, 7)}…${valueText.slice(-4)}`;
};
const fingerprint = (value) => createHash("sha256").update(text(value)).digest("hex").slice(0, 12);
const assertion = (checks, condition, name, detail) => {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
};

export function certifySnapshot(input) {
  const {
    providerSubscription,
    providerPayment,
    localSubscriptions = [],
    charges = [],
    events = [],
    access = [],
    mismatchCases = [],
    expectedCurrency = "INR",
    expectedAmountSubunits = null,
    expectedPlanId = null,
  } = input;
  const checks = [];
  const subscriptionId = text(providerSubscription?.id);
  const paymentId = text(providerPayment?.id);
  const local = localSubscriptions.find((row) => text(row.provider_subscription_id) === subscriptionId);
  const charge = charges.find((row) => text(row.provider_payment_id) === paymentId);
  const accessRow = access.find((row) =>
    text(row.provider_subscription_id) === subscriptionId &&
    text(row.source) === "razorpay" &&
    (!local || (text(row.user_id) === text(local.user_id) && text(row.plan_id) === text(local.plan_id)))
  );
  const reconciledEvents = events.filter((row) => text(row.outcome) === "reconciled");
  const paymentEvents = reconciledEvents.filter((row) => text(row.provider_payment_id) === paymentId);

  assertion(checks, /^sub_[A-Za-z0-9]+$/.test(subscriptionId), "provider subscription id", "Razorpay subscription id must be present and valid.");
  assertion(checks, /^pay_[A-Za-z0-9]+$/.test(paymentId), "provider payment id", "Razorpay payment id must be present and valid.");
  assertion(checks, text(providerPayment?.subscription_id) === subscriptionId, "provider payment ownership", "Payment must belong to the certified subscription.");
  assertion(checks, text(providerPayment?.status) === "captured", "provider payment captured", `Expected captured, observed ${text(providerPayment?.status) || "missing"}.`);
  assertion(checks, text(providerPayment?.currency).toUpperCase() === text(expectedCurrency).toUpperCase(), "provider currency", `Expected ${expectedCurrency}, observed ${text(providerPayment?.currency) || "missing"}.`);
  assertion(checks, number(providerPayment?.amount) > 0, "provider amount positive", "Captured amount must be greater than zero.");
  if (expectedAmountSubunits !== null && expectedAmountSubunits !== undefined && text(expectedAmountSubunits) !== "") {
    assertion(checks, number(providerPayment?.amount) === number(expectedAmountSubunits), "expected amount", `Expected ${number(expectedAmountSubunits)}, observed ${number(providerPayment?.amount)}.`);
  }
  assertion(checks, ["active", "authenticated", "pending", "paused"].includes(text(providerSubscription?.status)), "provider subscription state", `Unexpected state ${text(providerSubscription?.status) || "missing"}.`);
  assertion(checks, Boolean(local), "D1 subscription exists", "No local subscription matches the provider subscription.");
  assertion(checks, number(local?.provider_verified) === 1, "D1 provider verification", "Local recurring subscription is not provider-verified.");
  assertion(checks, text(local?.provider_plan_id) === text(providerSubscription?.plan_id), "provider plan alignment", "D1 provider plan does not match Razorpay.");
  assertion(checks, text(local?.status) === text(providerSubscription?.status), "subscription state alignment", `D1=${text(local?.status)}, Razorpay=${text(providerSubscription?.status)}.`);
  assertion(checks, text(local?.financial_state) === "paid", "D1 financial state", `Expected paid, observed ${text(local?.financial_state) || "missing"}.`);
  assertion(checks, number(local?.paid_count) >= 1, "paid cycle recorded", `Expected at least one paid cycle, observed ${number(local?.paid_count)}.`);
  if (expectedPlanId) assertion(checks, text(local?.plan_id) === text(expectedPlanId), "internal plan alignment", `Expected ${text(expectedPlanId)}, observed ${text(local?.plan_id)}.`);
  assertion(checks, Boolean(charge), "D1 captured charge exists", "No recurring charge row matches the certified payment.");
  assertion(checks, text(charge?.razorpay_subscription_id) === text(local?.id), "charge subscription linkage", "Charge is not linked to the matching internal subscription.");
  assertion(checks, text(charge?.provider_subscription_id) === subscriptionId, "charge provider linkage", "Charge provider subscription id does not match.");
  assertion(checks, text(charge?.status) === "captured", "D1 charge captured", `Expected captured, observed ${text(charge?.status) || "missing"}.`);
  assertion(checks, number(charge?.amount_subunits) === number(providerPayment?.amount), "charge amount alignment", `D1=${number(charge?.amount_subunits)}, Razorpay=${number(providerPayment?.amount)}.`);
  assertion(checks, text(charge?.currency).toUpperCase() === text(providerPayment?.currency).toUpperCase(), "charge currency alignment", `D1=${text(charge?.currency)}, Razorpay=${text(providerPayment?.currency)}.`);
  assertion(checks, reconciledEvents.length > 0, "reconciled webhook evidence", "No reconciled Razorpay subscription webhook is recorded for this subscription.");
  assertion(checks, paymentEvents.length > 0 || reconciledEvents.some((row) => text(row.provider_subscription_id) === subscriptionId), "webhook subscription linkage", "Reconciled webhook evidence is not linked to this payment/subscription.");
  assertion(checks, Boolean(accessRow), "student paid access exists", "No provider-attributed Razorpay access row matches the paid subscription.");
  assertion(checks, text(accessRow?.status) === "active", "student access active", `Expected active, observed ${text(accessRow?.status) || "missing"}.`);
  assertion(checks, mismatchCases.length === 0, "no open reconciliation mismatch", `${mismatchCases.length} unresolved reconciliation case(s) remain.`);

  return { checks, local, charge, accessRow, reconciledEvents, paymentEvents };
}

function parseDatabaseConfig(configText) {
  const name = configText.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  const id = configText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if (!name || !id) throw new Error("Could not resolve the Billing Worker D1 database from workers/billing/wrangler.jsonc.");
  return { name, id };
}

async function fetchJson(url, init, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const raw = await response.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!response.ok) {
        const description = data?.error?.description || data?.errors?.[0]?.message || `${response.status} ${response.statusText}`;
        throw new Error(`${label} failed: ${description}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
    }
  }
  throw lastError;
}

async function razorpay(path, keyId, keySecret) {
  return fetchJson(`https://api.razorpay.com/v1/${path}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      accept: "application/json",
    },
  }, `Razorpay ${path}`);
}

async function d1Query({ accountId, apiToken, databaseId }, sql, params = []) {
  const data = await fetchJson(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ sql, params }),
  }, "Cloudflare D1 query");
  if (data?.success === false) throw new Error(`Cloudflare D1 query failed: ${data?.errors?.[0]?.message || "unknown error"}`);
  const result = Array.isArray(data?.result) ? data.result[0] : data?.result;
  if (result?.success === false) throw new Error("Cloudflare D1 query returned an unsuccessful result.");
  return Array.isArray(result?.results) ? result.results : [];
}

async function collectDatabaseSnapshot(config, subscriptionId, paymentId) {
  const localSubscriptions = await d1Query(config, "SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 LIMIT 2", [subscriptionId]);
  const local = localSubscriptions[0];
  const charges = await d1Query(config, "SELECT * FROM razorpay_subscription_charges WHERE provider_payment_id=?1 LIMIT 2", [paymentId]);
  const events = await d1Query(config, "SELECT id,provider_event_id,provider_subscription_id,provider_payment_id,event_type,outcome,received_at,processed_at FROM razorpay_subscription_events WHERE provider_subscription_id=?1 ORDER BY received_at DESC LIMIT 50", [subscriptionId]);
  const access = await d1Query(config, "SELECT * FROM user_subscriptions WHERE provider_subscription_id=?1 ORDER BY updated_at DESC LIMIT 5", [subscriptionId]);
  const mismatchCases = await d1Query(config, "SELECT id,reason_code,severity,state FROM billing_reconciliation_cases WHERE provider_subscription_id=?1 AND state<>'resolved' ORDER BY last_seen_at DESC LIMIT 20", [subscriptionId]);
  return { localSubscriptions, local, charges, events, access, mismatchCases };
}

async function collectWithWebhookWait(config, subscriptionId, paymentId) {
  let snapshot;
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    snapshot = await collectDatabaseSnapshot(config, subscriptionId, paymentId);
    const reconciled = snapshot.events.some((row) => text(row.outcome) === "reconciled");
    if (reconciled && snapshot.charges.length && snapshot.access.length) return snapshot;
    if (attempt < 7) await new Promise((resolveDelay) => setTimeout(resolveDelay, 10000));
  }
  return snapshot;
}

async function appendSummary(evidence, summaryPath) {
  if (!summaryPath) return;
  const lines = [
    "## Billing Phase A — production certification",
    "",
    `**Result:** ${evidence.result === "passed" ? "✅ PASSED" : "❌ FAILED"}`,
    `**Checked:** ${evidence.checked_at}`,
    `**Commit:** \`${evidence.git_sha || "unknown"}\``,
    `**Database:** \`${evidence.database.name}\``,
    `**Subscription:** \`${evidence.provider.subscription_id}\``,
    `**Payment:** \`${evidence.provider.payment_id}\``,
    "",
  ];
  if (evidence.result === "passed") {
    lines.push(
      `Provider subscription: **${evidence.provider.subscription_status}**`,
      `Provider payment: **${evidence.provider.payment_status}** · ${evidence.provider.currency} ${Number(evidence.provider.amount_subunits) / 100}`,
      `Reconciled webhook events: **${evidence.database.reconciled_webhook_events}**`,
      `Open mismatch cases: **${evidence.database.open_mismatch_cases}**`,
      "",
      "All Razorpay → webhook → D1 → entitlement checks passed."
    );
  } else {
    lines.push(`Failure: ${evidence.failure || "Certification failed."}`);
  }
  await appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const env = process.env;
  const keyId = required("RAZORPAY_KEY_ID", env);
  const keySecret = required("RAZORPAY_KEY_SECRET", env);
  const accountId = required("CLOUDFLARE_ACCOUNT_ID", env);
  const apiToken = required("CLOUDFLARE_API_TOKEN", env);
  const subscriptionId = required("CA_BILLING_CERT_SUBSCRIPTION_ID", env);
  const paymentId = required("CA_BILLING_CERT_PAYMENT_ID", env);
  if (!keyId.startsWith("rzp_live_")) throw new Error("Phase A certification requires Razorpay live-mode credentials; test mode cannot certify production money flow.");
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw new Error("CA_BILLING_CERT_SUBSCRIPTION_ID must be a Razorpay sub_ identifier.");
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error("CA_BILLING_CERT_PAYMENT_ID must be a Razorpay pay_ identifier.");

  const configPath = resolve(env.CA_BILLING_WRANGLER_CONFIG || "workers/billing/wrangler.jsonc");
  const database = parseDatabaseConfig(await readFile(configPath, "utf8"));
  const d1 = { accountId, apiToken, databaseId: database.id };
  const [providerSubscription, providerPayment] = await Promise.all([
    razorpay(`subscriptions/${encodeURIComponent(subscriptionId)}`, keyId, keySecret),
    razorpay(`payments/${encodeURIComponent(paymentId)}`, keyId, keySecret),
  ]);
  const dbSnapshot = await collectWithWebhookWait(d1, subscriptionId, paymentId);
  const result = certifySnapshot({
    providerSubscription,
    providerPayment,
    ...dbSnapshot,
    expectedCurrency: text(env.CA_BILLING_CERT_EXPECTED_CURRENCY) || "INR",
    expectedAmountSubunits: text(env.CA_BILLING_CERT_EXPECTED_AMOUNT_SUBUNITS) || null,
    expectedPlanId: text(env.CA_BILLING_CERT_EXPECTED_PLAN_ID) || null,
  });

  const evidence = {
    schema_version: 1,
    phase: "A",
    result: "passed",
    checked_at: new Date().toISOString(),
    git_sha: text(env.GITHUB_SHA) || null,
    mode: "razorpay-live",
    database: {
      name: database.name,
      id_fingerprint: fingerprint(database.id),
      subscription_status: text(result.local.status),
      financial_state: text(result.local.financial_state),
      provider_verified: number(result.local.provider_verified) === 1,
      paid_count: number(result.local.paid_count),
      reconciled_webhook_events: result.reconciledEvents.length,
      payment_linked_webhook_events: result.paymentEvents.length,
      paid_access_status: text(result.accessRow.status),
      open_mismatch_cases: dbSnapshot.mismatchCases.length,
    },
    provider: {
      subscription_id: mask(subscriptionId),
      payment_id: mask(paymentId),
      subscription_status: text(providerSubscription.status),
      payment_status: text(providerPayment.status),
      amount_subunits: number(providerPayment.amount),
      currency: text(providerPayment.currency),
      plan_id: mask(providerSubscription.plan_id),
    },
    subject: {
      user_fingerprint: fingerprint(result.local.user_id),
      internal_plan_fingerprint: fingerprint(result.local.plan_id),
    },
    checks: result.checks,
  };
  const outputPath = resolve(env.CA_BILLING_CERT_EVIDENCE_PATH || "deployment-evidence/billing-phase-a.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await appendSummary(evidence, text(env.GITHUB_STEP_SUMMARY));
  console.log(`Billing Phase A certification passed for ${mask(subscriptionId)} / ${mask(paymentId)}.`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main().catch(async (error) => {
    const message = error instanceof Error ? error.message : "Billing Phase A certification failed.";
    const evidence = {
      schema_version: 1,
      phase: "A",
      result: "failed",
      checked_at: new Date().toISOString(),
      git_sha: text(process.env.GITHUB_SHA) || null,
      mode: "razorpay-live",
      database: { name: "production", id_fingerprint: null },
      provider: {
        subscription_id: mask(process.env.CA_BILLING_CERT_SUBSCRIPTION_ID),
        payment_id: mask(process.env.CA_BILLING_CERT_PAYMENT_ID),
      },
      failure: message.slice(0, 500),
    };
    try {
      const outputPath = resolve(process.env.CA_BILLING_CERT_EVIDENCE_PATH || "deployment-evidence/billing-phase-a.json");
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
      await appendSummary(evidence, text(process.env.GITHUB_STEP_SUMMARY));
    } catch {}
    console.error(message);
    process.exitCode = 1;
  });
}
