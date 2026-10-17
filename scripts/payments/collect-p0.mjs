import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BASELINE_SHA = "e2c1ed9dff4a724ce59dbd859db0f7f9ebc60a88";
const fp = value => createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 12);
export const QUERIES = {
  effectivePolicies: `SELECT sp.tier_key,sp.billing_cycle,sp.active,sp.checkout_enabled,pv.id policy_version_id,pv.version,pv.price_subunits,pv.currency,pv.trial_days,pv.grace_days,ot.intro_price_subunits,ot.intro_billing_cycles,ot.provider_offer_id,ot.provider_offer_verified_at,
    (SELECT COUNT(*) FROM razorpay_plan_mappings m WHERE m.policy_version_id=pv.id AND m.price_kind='recurring' AND m.state='ready') ready_mapping_count
    FROM subscription_plans sp LEFT JOIN plan_policy_versions pv ON pv.id=(SELECT c.id FROM plan_policy_versions c WHERE c.plan_id=sp.id AND c.state='published' AND (c.effective_at IS NULL OR datetime(c.effective_at)<=datetime('now')) ORDER BY COALESCE(c.effective_at,c.published_at,c.created_at) DESC,c.version DESC LIMIT 1)
    LEFT JOIN plan_policy_offer_terms ot ON ot.policy_version_id=pv.id ORDER BY sp.sort_order`,
  contracts: `SELECT pc.policy_version_id,pc.grandfathered,us.status,COUNT(*) contract_count FROM subscription_policy_contracts pc JOIN user_subscriptions us ON us.id=pc.subscription_id GROUP BY pc.policy_version_id,pc.grandfathered,us.status`,
  access: `SELECT source,status,COUNT(*) row_count,SUM(CASE WHEN datetime(starts_at)<=datetime('now') AND datetime(ends_at)>datetime('now') THEN 1 ELSE 0 END) current_term_count FROM user_subscriptions GROUP BY source,status`,
  charges: `SELECT status,currency,refund_state,dispute_state,COUNT(*) row_count,SUM(amount_subunits) amount_subunits FROM razorpay_subscription_charges GROUP BY status,currency,refund_state,dispute_state`,
  hiddenOpen: `SELECT COUNT(*) row_count FROM razorpay_subscriptions live WHERE live.status NOT IN ('cancelled','completed','expired') AND EXISTS(SELECT 1 FROM razorpay_subscriptions later WHERE later.user_id=live.user_id AND later.created_at>live.created_at)`,
  paidWithoutAccess: `SELECT COUNT(*) row_count FROM razorpay_subscriptions rs WHERE rs.paid_count>0 AND datetime(rs.paid_through_at)>datetime('now') AND NOT EXISTS(SELECT 1 FROM user_subscriptions us WHERE us.provider_subscription_id=rs.provider_subscription_id AND us.user_id=rs.user_id AND datetime(us.ends_at)>=datetime(rs.paid_through_at))`,
  contractGaps: `SELECT COUNT(*) row_count FROM user_subscriptions us WHERE us.source='razorpay' AND NOT EXISTS(SELECT 1 FROM subscription_policy_contracts pc WHERE pc.subscription_id=us.id)`,
  featureCounts: `SELECT policy_version_id,COUNT(*) feature_count FROM plan_policy_features GROUP BY policy_version_id`,
  identityCounts: `SELECT COUNT(*) app_users FROM app_users`,
};

export function assertReadOnlySql(sql) {
  if (!Object.values(QUERIES).includes(sql)) throw new Error("Query is not in the Phase 0 SELECT allowlist");
  if (!/^SELECT\b/i.test(sql) || /;|\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|PRAGMA|ATTACH)\b/i.test(sql)) throw new Error("Read-only guard rejected SQL");
}

export async function readJson(url, init = {}, fetcher = fetch) {
  if ((init.method ?? "GET") !== "GET") throw new Error("Provider mutations are forbidden in Phase 0");
  const response = await fetcher(url, { ...init, method: "GET", redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Read failed with HTTP ${response.status}`);
  const data = await response.json();
  if (data.success === false) throw new Error("Provider returned unsuccessful read");
  return data.result ?? data;
}

export function safeRows(rows) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, ["policy_version_id", "provider_offer_id"].includes(key) && value ? fp(value) : value])));
}

export function classify(policies) {
  const findings = [];
  for (const p of policies.filter(p => p.active && p.checkout_enabled && p.tier_key !== "free")) {
    const target = { tier: p.tier_key, cycle: p.billing_cycle, version: p.version };
    if (!p.policy_version_id) findings.push({ code: "missing_effective_policy", severity: "critical", ...target });
    else if (Number(p.ready_mapping_count) !== 1) findings.push({ code: "effective_policy_mapping_not_ready", severity: "critical", ...target });
    if (p.intro_price_subunits != null && (!p.provider_offer_id || !p.provider_offer_verified_at)) findings.push({ code: "intro_offer_verification_gap", severity: "high", ...target });
  }
  return findings;
}

export function publicSummary(output) {
  const pick = (row, keys) => Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
  const scalarCounts = rows => rows?.map(row => Object.fromEntries(Object.entries(row).filter(([key, value]) => typeof value === "number" && !key.endsWith("_id")))) ?? null;
  return { schema_version: output.schema_version, phase: output.phase, checked_at: output.checked_at,
    baseline_sha: output.baseline_sha, audit_sha: output.audit_sha, status: output.status,
    deployments: output.deployments, gateway_key_mode: output.gateway_key_mode, paymentMethods: output.paymentMethods, health: output.health,
    commercial_terms: output.observations.effectivePolicies?.map(row => pick(row, ["tier_key", "billing_cycle", "active", "checkout_enabled", "version", "price_subunits", "currency", "trial_days", "grace_days", "intro_price_subunits", "intro_billing_cycles", "ready_mapping_count"])) ?? null,
    contract_counts: scalarCounts(output.observations.contracts),
    access_counts: output.observations.access?.map(row => pick(row, ["source", "status", "row_count", "current_term_count"])) ?? null,
    charge_totals: output.observations.charges?.map(row => pick(row, ["status", "currency", "refund_state", "dispute_state", "row_count", "amount_subunits"])) ?? null,
    offer_checks: output.offerChecks ?? [], construction_issue_counts: output.constructionIssueCounts ?? {},
    audit_totals: Object.fromEntries(["truth-map", "subscription-inventory", "plan-offer"].map(name => [name, output.observations[name]?.summary ?? null])),
    findings: output.findings, coverage: output.coverage, safety: { ...output.safety, export: "aggregate_counts_and_commercial_terms_only", customer_identifiers_exported: false, transaction_identifiers_exported: false } };
}

async function main() {
  const folder = resolve("deployment-evidence/payment-system-p0");
  await mkdir(folder, { recursive: true });
  const required = name => { if (!process.env[name]) throw new Error(`${name} is required`); return process.env[name]; };
  const account = required("CLOUDFLARE_ACCOUNT_ID"), token = required("CLOUDFLARE_API_TOKEN");
  const config = await readFile("workers/billing/wrangler.jsonc", "utf8");
  const databaseId = config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if (!databaseId) throw new Error("D1 target missing");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const coverage = [], observations = {};
  async function capture(name, fn) {
    try { const data = await fn(); coverage.push({ name, status: "observed" }); return data; }
    catch (error) { coverage.push({ name, status: "blocked", reason: error.message }); return null; }
  }
  for (const [name, sql] of Object.entries(QUERIES)) {
    observations[name] = await capture(`D1.${name}`, async () => {
      assertReadOnlySql(sql);
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${databaseId}/query`, { method: "POST", headers, body: JSON.stringify({ sql, params: [] }), redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`D1 read HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success || data.result?.[0]?.success === false) throw new Error(`D1 query failed: ${name}`);
      return name === "effectivePolicies" ? (data.result[0].results ?? []) : safeRows(data.result[0].results ?? []);
    });
  }
  const deployments = {};
  for (const worker of ["ca-progress-v2", "ca-progress-v2-billing"]) {
    const root = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}`;
    deployments[worker] = await capture(`deployment.${worker}`, async () => {
      const data = await readJson(`${root}/deployments`, { headers });
      const list = data.deployments ?? (Array.isArray(data) ? data : []);
      const current = list.slice().sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))[0];
      if (!current?.versions?.length) throw new Error("No live deployment version was returned");
      const versions = [];
      for (const version of current.versions) {
        const value = await readJson(`${root}/versions/${version.version_id}`, { headers });
        const annotations = value.annotations ?? {};
        const sha = JSON.stringify(annotations).match(/\b[0-9a-f]{40}\b/i)?.[0] ?? null;
        versions.push({ version_id: version.version_id, percentage: version.percentage, created_on: value.metadata?.created_on ?? null, source: value.metadata?.source ?? null, git_sha: sha,
          bindings: (value.resources?.bindings ?? []).filter(b => ["d1", "service", "queue"].includes(b.type)).map(b => ({ name: b.name, type: b.type, database_fingerprint: b.type === "d1" ? fp(b.id) : null, service: b.type === "service" ? b.service : null })) });
      }
      return { deployment_id: current.id, created_on: current.created_on, versions, git_provenance: versions.every(v => v.git_sha) ? "annotated" : "not_exposed_by_provider_metadata" };
    });
  }
  const key = required("RAZORPAY_KEY_ID"), secret = required("RAZORPAY_KEY_SECRET");
  const offerChecks = [];
  for (const policy of observations.effectivePolicies ?? []) {
    if (!policy.active || !policy.checkout_enabled || policy.intro_price_subunits == null) continue;
    const offer = policy.provider_offer_id ? await capture(`razorpay.policy_offer.${policy.tier_key}`, async () => {
      const value = await readJson(`https://api.razorpay.com/v1/offers/${encodeURIComponent(policy.provider_offer_id)}`, { headers: { authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` } });
      return { active: value.active === true, payment_method: value.payment_method ?? null, discount_type: value.discount_type ?? null, discount_value: value.discount_value ?? null, starts_at: value.starts_at ?? null, ends_at: value.ends_at ?? null };
    }) : null;
    offerChecks.push({ tier: policy.tier_key, cycle: policy.billing_cycle, version: policy.version, stored_verified: Boolean(policy.provider_offer_verified_at), independent_read_succeeded: Boolean(offer), provider: offer });
  }
  const paymentMethods = await capture("razorpay.payment_methods", async () => {
    const data = await readJson("https://api.razorpay.com/v1/methods", { headers: { authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` } });
    return { card: data.card === true, upi: data.upi === true, emandate: data.emandate === true, recurring_capability_proven: false, note: "Gateway method availability does not establish subscription/PSP/mandate support" };
  });
  const health = await capture("web.health", async () => {
    const res = await fetch("https://ca-progress-v2.habeebaasif622.workers.dev/api/health", { redirect: "error", signal: AbortSignal.timeout(30000) });
    return { http_status: res.status, reachable: true };
  });
  const findings = classify(observations.effectivePolicies ?? []);
  for (const [query, code] of [["hiddenOpen", "newest_row_can_hide_open_subscription"], ["paidWithoutAccess", "paid_term_without_matching_access"], ["contractGaps", "razorpay_access_without_policy_contract"]]) {
    const count = Number(observations[query]?.[0]?.row_count ?? 0);
    if (count) findings.push({ code, severity: query === "paidWithoutAccess" ? "critical" : "high", count });
  }
  const constructionIssueCounts = {};
  for (const name of ["truth-map", "subscription-inventory", "plan-offer"]) {
    observations[name] = await capture(`artifact.${name}`, async () => {
      const data = JSON.parse(await readFile(`${folder}/${name}.json`, "utf8"));
      if (name === "plan-offer") {
        const allowed = new Set(["current_plan_mapping_missing", "recurring_plan_mapping_missing", "current_policy_mismatch", "recurring_policy_mismatch", "intro_mapping_without_intro_cycles", "discounted_initial_price_without_intro_plan", "intro_and_recurring_plan_same"]);
        for (const sub of data.subscriptions ?? []) for (const issue of sub.construction?.issues ?? []) if (allowed.has(issue)) constructionIssueCounts[issue] = (constructionIssueCounts[issue] ?? 0) + 1;
      }
      return { checked_at: data.checked_at, git_sha: data.git_sha, summary: data.summary };
    });
  }
  coverage.push({ name: "QR checkout", status: "owner_reported_resolved", reason: "No checkout or mandate was created in read-only Phase 0" },
    { name: "real recurring mandate and renewal", status: "not_exercised", reason: "Requires controlled authorization and cycle proof in P3/P12" },
    { name: "subscription offers and method capabilities", status: "requires_provider_dashboard_evidence", reason: "Gateway methods and offer GET failures cannot establish recurring offer support" });
  const output = { schema_version: 1, phase: "payment-system-P0", checked_at: new Date().toISOString(), baseline_sha: BASELINE_SHA, audit_sha: process.env.GITHUB_SHA ?? null,
    status: coverage.some(c => c.status === "blocked") ? "partial_inventory" : "inventory_collected", deployments, gateway_key_mode: key.startsWith("rzp_live_") ? "live" : key.startsWith("rzp_test_") ? "test" : "unknown", paymentMethods, health, observations, findings, coverage, offerChecks, constructionIssueCounts,
    safety: { live_mutations: false, provider_operations: ["GET"], d1_operations: ["allowlisted SELECT"], deployment_performed: false, qr_status: "owner_reported_fixed_not_retested" } };
  await writeFile(`${folder}/public-summary.json`, JSON.stringify(publicSummary(output), null, 2) + "\n");
  console.log(JSON.stringify({ status: output.status, findings: findings.length, blocked: coverage.filter(c => c.status === "blocked").map(c => c.name) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
