import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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

export const candidateSql = `SELECT ch.provider_payment_id,ch.provider_subscription_id,ch.captured_at
FROM razorpay_subscription_charges ch
JOIN razorpay_subscriptions rs ON rs.id=ch.razorpay_subscription_id
WHERE ch.status='captured' AND rs.provider_verified=1
ORDER BY COALESCE(ch.captured_at,ch.updated_at) DESC
LIMIT 1`;

async function queryD1(accountId, apiToken, databaseId) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sql: candidateSql, params: [] }),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok || data?.success === false) throw new Error(data?.errors?.[0]?.message || `Cloudflare D1 discovery failed (${response.status}).`);
  const result = Array.isArray(data?.result) ? data.result[0] : data?.result;
  return Array.isArray(result?.results) ? result.results : [];
}

async function writePending(database, reason) {
  const outputPath = resolve(process.env.CA_BILLING_CERT_EVIDENCE_PATH || "deployment-evidence/billing-phase-a.json");
  const evidence = {
    schema_version: 1,
    phase: "A",
    result: "pending",
    checked_at: new Date().toISOString(),
    git_sha: text(process.env.GITHUB_SHA) || null,
    mode: "razorpay-live",
    database: { name: database.name, id_fingerprint: fingerprint(database.id) },
    provider: { subscription_id: "—", payment_id: "—" },
    pending_reason: reason,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const summaryPath = text(process.env.GITHUB_STEP_SUMMARY);
  if (summaryPath) {
    await appendFile(summaryPath, [
      "## Billing Phase A — production certification",
      "",
      "**Result:** ⏳ PENDING LIVE TRANSACTION",
      `**Checked:** ${evidence.checked_at}`,
      `**Commit:** \`${evidence.git_sha || "unknown"}\``,
      `**Database:** \`${database.name}\``,
      "",
      reason,
      "",
      "No payment was created or mutated by this workflow.",
      "",
    ].join("\n"), "utf8");
  }
  console.log(`Billing Phase A remains pending: ${reason}`);
}

async function main() {
  const configPath = resolve(process.env.CA_BILLING_WRANGLER_CONFIG || "workers/billing/wrangler.jsonc");
  const database = parseDatabaseConfig(await readFile(configPath, "utf8"));
  let subscriptionId = text(process.env.CA_BILLING_CERT_SUBSCRIPTION_ID);
  let paymentId = text(process.env.CA_BILLING_CERT_PAYMENT_ID);

  if (!subscriptionId || !paymentId) {
    const rows = await queryD1(required("CLOUDFLARE_ACCOUNT_ID"), required("CLOUDFLARE_API_TOKEN"), database.id);
    const candidate = rows[0];
    subscriptionId = text(candidate?.provider_subscription_id);
    paymentId = text(candidate?.provider_payment_id);
    if (!subscriptionId || !paymentId) {
      await writePending(database, "No provider-verified captured recurring Razorpay charge exists in production D1 yet. Complete one normal live checkout before the Phase A exit gate can pass.");
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

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : "Automatic Billing Phase A certification failed.";
  console.error(message);
  process.exitCode = 1;
});
