import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  ExactCleanupRegistry,
  PHASE2_MARKER_PREFIX,
  buildProgressRestoreSql,
  fixtureMarker,
  normalizeProgressSnapshot,
  progressSnapshotComparable,
  progressStageSummary,
  sqlLiteral,
} from "./phase2-fixture-helpers.mjs";

const REPORT_DIRECTORY = "phase2-report";
const REPORT_JSON = `${REPORT_DIRECTORY}/fixture-discovery.json`;
const REPORT_MARKDOWN = `${REPORT_DIRECTORY}/fixture-discovery.md`;
const database = process.env.PHASE2_D1_DATABASE || process.env.PHASE1_D1_DATABASE || "ca-progress-v2-phase4-shadow";
const baseUrl = (process.env.SMOKE_BASE_URL || "https://ca-progress-v2.habeebaasif622.workers.dev").replace(/\/$/, "");
const REQUIRED_ENVIRONMENT = ["SMOKE_MUTATION_AUTH_COOKIE", "SMOKE_MODERATOR_AUTH_COOKIE", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
const SECRET_ENVIRONMENT = ["SMOKE_MUTATION_AUTH_COOKIE", "SMOKE_MODERATOR_AUTH_COOKIE", "CLOUDFLARE_API_TOKEN"];
const PRIVILEGED_ROLES = new Set(["moderator", "admin", "owner", "parent_owner"]);
const checks = [];
const sensitiveValues = SECRET_ENVIRONMENT.map((name) => process.env[name] || "").filter(Boolean);
const observedIdentityValues = [];
const cleanupRegistry = new ExactCleanupRegistry();
const marker = fixtureMarker();

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function redactText(value) {
  let output = String(value ?? "");
  for (const secret of [...sensitiveValues, ...observedIdentityValues].sort((a, b) => b.length - a.length)) {
    if (secret.length >= 4) output = output.split(secret).join(`[redacted:${digest(secret)}]`);
  }
  output = output.replace(/([?&](?:code|token|key|secret)=)[^&\s]+/gi, "$1[redacted]");
  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
  return output.slice(0, 2_000);
}

function record(name, status, evidence, required = true) {
  if (!new Set(["passed", "failed", "unsupported"]).has(status)) throw new Error(`Invalid check status: ${status}`);
  checks.push({ name, status, required, evidence: redactText(evidence) });
}

function normalizedCookie(name) {
  const value = process.env[name]?.trim() || "";
  if (!value) return "";
  if (/[\r\n]/.test(value)) throw new Error(`${name} contains an invalid newline`);
  return value.includes("=") ? value : `ca_session=${value}`;
}

async function viewer(sessionName, cookie) {
  try {
    const response = await fetch(`${baseUrl}/api/auth/viewer`, {
      method: "GET",
      redirect: "manual",
      headers: { cookie, accept: "application/json", "x-ca-verification": "phase2-fixtures" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.authenticated !== true || typeof body.id !== "string" || !body.id) {
      record(`${sessionName} session authentication`, "failed", `HTTP ${response.status}; authenticated=${body?.authenticated === true}`);
      return null;
    }
    observedIdentityValues.push(body.id);
    record(`${sessionName} session authentication`, "passed", `HTTP ${response.status}; stable user hash=${digest(body.id)}`);
    return body.id;
  } catch (error) {
    record(`${sessionName} session authentication`, "failed", `Request failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function remoteD1(sql) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "d1", "execute", database, "--remote", "--json", "--config", "wrangler.web.jsonc", "--command", sql],
    { encoding: "utf8", env: process.env, maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) throw new Error(redactText(result.error?.message || result.stderr || `Wrangler exited ${result.status}`));
  const parsed = JSON.parse(result.stdout);
  const execution = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!execution?.success || !Array.isArray(execution.results)) throw new Error("Wrangler returned an unsuccessful or malformed D1 response");
  return execution.results;
}

function discoverIdentity(sessionName, userId, privileged = false) {
  if (!userId) return null;
  try {
    const rows = remoteD1(`SELECT u.user_id,u.role,u.account_state,p.onboarding_completed_at,p.ca_level,p.group_choice,p.attempt_key FROM app_users u LEFT JOIN profiles p ON p.user_id=u.user_id WHERE u.user_id=${sqlLiteral(userId)} LIMIT 1`);
    const row = rows[0];
    if (!row || row.user_id !== userId || row.account_state !== "active") {
      record(`${sessionName} D1 fixture`, "failed", `Expected one active app_users row; rows=${rows.length}`);
      return null;
    }
    if (privileged && !PRIVILEGED_ROLES.has(row.role)) {
      record(`${sessionName} D1 fixture`, "failed", `Role ${row.role || "missing"} is not privileged`);
      return null;
    }
    if (!row.onboarding_completed_at) {
      record(`${sessionName} D1 fixture`, "failed", "Authenticated identity has no completed onboarding profile");
      return null;
    }
    record(`${sessionName} D1 fixture`, "passed", `user hash=${digest(userId)}; role=${row.role}; active=true; onboarding=true`);
    return row;
  } catch (error) {
    record(`${sessionName} D1 fixture`, "failed", `Remote query failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function discoverAcademicFixture(userId) {
  const rows = remoteD1(`SELECT p.ca_level,p.group_choice,l.id AS level_id,l.code AS level_code,g.id AS group_id,g.code AS group_code,s.id AS subject_id,s.slug AS subject_slug,asm.syllabus_version_id,sv.version_key,c.id AS chapter_id,c.stable_key AS chapter_key,c.slug AS chapter_slug
    FROM profiles p
    JOIN course_levels l ON l.code=p.ca_level AND l.is_active=1
    JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
    JOIN course_groups g ON g.id=asm.group_id AND g.is_active=1
    JOIN subjects s ON s.id=asm.subject_id AND s.is_active=1
    JOIN syllabus_versions sv ON sv.id=asm.syllabus_version_id
    JOIN chapters c ON c.syllabus_version_id=asm.syllabus_version_id
    WHERE p.user_id=${sqlLiteral(userId)} AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice)
    ORDER BY g.sort_order ASC,s.sort_order ASC,c.sort_order ASC LIMIT 1`);
  if (!rows[0]) throw new Error("No applicable level/group/subject/syllabus/chapter tuple exists for the mutation user");
  return rows[0];
}

function discoverWritableCommunity(userId) {
  const rows = remoteD1(`SELECT cc.id,cc.channel_key,cc.slug,cc.scope_type,cc.write_policy
    FROM community_channels cc
    WHERE cc.is_active=1 AND cc.write_policy IN ('members','all') AND (
      cc.scope_type='global'
      OR (cc.scope_type='level' AND cc.level_id=(SELECT l.id FROM profiles p JOIN course_levels l ON l.code=p.ca_level WHERE p.user_id=${sqlLiteral(userId)} LIMIT 1))
      OR (cc.scope_type='subject' AND cc.subject_id IN (
        SELECT asm.subject_id FROM profiles p
        JOIN course_levels l ON l.code=p.ca_level
        JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
        JOIN course_groups g ON g.id=asm.group_id
        WHERE p.user_id=${sqlLiteral(userId)} AND p.onboarding_completed_at IS NOT NULL
          AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice)
      ))
    )
    ORDER BY CASE cc.scope_type WHEN 'subject' THEN 0 WHEN 'level' THEN 1 ELSE 2 END,cc.sort_order ASC,cc.slug ASC LIMIT 1`);
  if (!rows[0]) throw new Error("No visible Community channel with members/all write policy exists for the mutation user");
  return rows[0];
}

function discoverEntitlements(userId) {
  return remoteD1(`SELECT sp.tier_key,sp.billing_cycle,COUNT(pe.id) AS entitlement_count,COALESCE(SUM(CASE WHEN pe.enabled=1 THEN 1 ELSE 0 END),0) AS enabled_entitlement_count
    FROM subscription_plans sp
    LEFT JOIN plan_entitlements pe ON pe.plan_id=sp.id
    WHERE sp.id=COALESCE(
      (SELECT us.plan_id FROM user_subscriptions us WHERE us.user_id=${sqlLiteral(userId)} AND us.status='active' AND (us.ends_at IS NULL OR us.ends_at>CURRENT_TIMESTAMP) ORDER BY us.starts_at DESC LIMIT 1),
      (SELECT fp.id FROM subscription_plans fp WHERE fp.tier_key='free' AND fp.active=1 ORDER BY fp.sort_order ASC LIMIT 1)
    )
    GROUP BY sp.id,sp.tier_key,sp.billing_cycle LIMIT 1`)[0] || null;
}

async function discoverR2() {
  const config = await readFile("wrangler.web.jsonc", "utf8");
  const match = config.match(/"binding"\s*:\s*"USER_RESOURCES_R2"\s*,\s*"bucket_name"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error("USER_RESOURCES_R2 binding is missing from wrangler.web.jsonc");
  const bucket = match[1];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true || body?.result?.name !== bucket) {
    const message = Array.isArray(body?.errors) ? body.errors.map((item) => item?.message).filter(Boolean).join("; ") : "unknown Cloudflare API error";
    throw new Error(`R2 bucket lookup failed with HTTP ${response.status}: ${message}`);
  }
  return { binding: "USER_RESOURCES_R2", bucket };
}

function readProgressSnapshot(userId, chapterId) {
  const row = remoteD1(`SELECT user_id,chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,created_at,updated_at FROM chapter_progress WHERE user_id=${sqlLiteral(userId)} AND chapter_id=${sqlLiteral(chapterId)} LIMIT 1`)[0] || null;
  return normalizeProgressSnapshot(userId, chapterId, row);
}

function readProgressHistoryCount(userId, chapterId) {
  const row = remoteD1(`SELECT COUNT(*) AS event_count FROM progress_events WHERE user_id=${sqlLiteral(userId)} AND chapter_id=${sqlLiteral(chapterId)}`)[0];
  return Number(row?.event_count ?? 0);
}

function markdown(report) {
  const rows = report.checks.map((check) => `| ${check.name} | ${check.status} | ${check.required ? "yes" : "no"} | ${check.evidence.replaceAll("|", "\\|")} |`).join("\n");
  return `# Phase 2 dynamic fixture discovery and cleanup foundation\n\n- Result: **${report.status}**\n- Generated: ${report.generatedAt}\n- Commit: \`${report.commit}\`\n- Workflow run: \`${report.workflowRun}\`\n- Marker: \`${report.marker}\`\n- Target: ${report.target}\n- D1 database: \`${report.database}\`\n\n## Discovered fixture summary\n\n- Mutation user: \`${report.fixtures.mutationUserHash || "unavailable"}\`\n- Moderator user: \`${report.fixtures.moderatorUserHash || "unavailable"}\`\n- Community channel: \`${report.fixtures.community?.slug || "unavailable"}\`\n- Academic scope: \`${report.fixtures.academic ? `${report.fixtures.academic.levelCode}/${report.fixtures.academic.groupCode}/${report.fixtures.academic.subjectSlug}` : "unavailable"}\`\n- Subscription tier: \`${report.fixtures.entitlement?.tierKey || "unavailable"}\`\n- R2 binding: \`${report.fixtures.r2?.binding || "unavailable"}\`\n- Progress snapshot exists: \`${report.fixtures.progress?.exists ?? "unavailable"}\`\n\n| Check | Status | Required | Evidence |\n| --- | --- | --- | --- |\n${rows}\n\nPhase 2 performs no production mutation. Exact captured-ID cleanup and exact current-row progress restoration are armed for later mutation phases; progress event history is never deleted by the restore helper.\n`;
}

await mkdir(REPORT_DIRECTORY, { recursive: true });
record("verification marker", marker.startsWith(PHASE2_MARKER_PREFIX) ? "passed" : "failed", `marker=${marker}`);
for (const name of REQUIRED_ENVIRONMENT) record(`environment:${name}`, process.env[name] ? "passed" : "failed", process.env[name] ? "configured" : "missing");
record("environment:D1 database", database ? "passed" : "failed", database ? `configured=${database}` : "missing");

let normalUserId = null;
let moderatorUserId = null;
let academic = null;
let community = null;
let entitlement = null;
let r2 = null;
let progressBefore = null;
let progressHistoryBefore = null;

try {
  if (process.env.SMOKE_MUTATION_AUTH_COOKIE) normalUserId = await viewer("mutation user", normalizedCookie("SMOKE_MUTATION_AUTH_COOKIE"));
  if (process.env.SMOKE_MODERATOR_AUTH_COOKIE) moderatorUserId = await viewer("moderator", normalizedCookie("SMOKE_MODERATOR_AUTH_COOKIE"));
  if (normalUserId && moderatorUserId) {
    record("independent test identities", normalUserId !== moderatorUserId ? "passed" : "failed", normalUserId !== moderatorUserId ? "sessions resolve to different stable IDs" : "sessions resolve to the same stable ID");
  }

  const normalIdentity = normalUserId ? discoverIdentity("mutation user", normalUserId, false) : null;
  const moderatorIdentity = moderatorUserId ? discoverIdentity("moderator", moderatorUserId, true) : null;
  if (normalIdentity && moderatorIdentity) {
    try {
      academic = discoverAcademicFixture(normalUserId);
      record("applicable academic fixture", "passed", `level=${academic.level_code}; group=${academic.group_code}; subject=${academic.subject_slug}; syllabus hash=${digest(academic.syllabus_version_id)}; chapter hash=${digest(academic.chapter_id)}`);
    } catch (error) {
      record("applicable academic fixture", "failed", error instanceof Error ? error.message : error);
    }

    try {
      community = discoverWritableCommunity(normalUserId);
      record("writable Community fixture", "passed", `slug=${community.slug}; scope=${community.scope_type}; policy=${community.write_policy}; channel hash=${digest(community.id)}`);
    } catch (error) {
      record("writable Community fixture", "failed", error instanceof Error ? error.message : error);
    }

    try {
      entitlement = discoverEntitlements(normalUserId);
      if (!entitlement) throw new Error("No active user subscription or active free-plan fallback could be resolved");
      record("subscription entitlement fixture", "passed", `tier=${entitlement.tier_key}; cycle=${entitlement.billing_cycle}; enabled=${Number(entitlement.enabled_entitlement_count)}/${Number(entitlement.entitlement_count)}`);
    } catch (error) {
      record("subscription entitlement fixture", "failed", error instanceof Error ? error.message : error);
    }
  }

  try {
    r2 = await discoverR2();
    record("R2 bucket availability", "passed", `binding=${r2.binding}; bucket hash=${digest(r2.bucket)}; Cloudflare Get Bucket succeeded`);
  } catch (error) {
    record("R2 bucket availability", "failed", error instanceof Error ? error.message : error);
  }

  if (normalUserId && academic?.chapter_id) {
    try {
      progressBefore = readProgressSnapshot(normalUserId, academic.chapter_id);
      progressHistoryBefore = readProgressHistoryCount(normalUserId, academic.chapter_id);
      const restoreSql = buildProgressRestoreSql(progressBefore);
      const exactKeyPresent = restoreSql.includes(sqlLiteral(normalUserId)) && restoreSql.includes(sqlLiteral(academic.chapter_id));
      const historyUntouched = !/progress_events/i.test(restoreSql);
      record("progress snapshot and exact restore plan", exactKeyPresent && historyUntouched ? "passed" : "failed", `chapter hash=${digest(academic.chapter_id)}; current-row-exists=${progressBefore.exists}; exact composite key=${exactKeyPresent}; progress history untouched=${historyUntouched}`);
    } catch (error) {
      record("progress snapshot and exact restore plan", "failed", error instanceof Error ? error.message : error);
    }
  }

  try {
    const probe = new ExactCleanupRegistry();
    const probeId = `${marker}-cleanup-probe`;
    let observed = null;
    probe.capture({ kind: "contract-probe", id: probeId, cleanup: async (id) => { observed = id; } });
    const probeResults = await probe.run();
    const exact = probeResults.length === 1 && probeResults[0].status === "passed" && observed === probeId;
    record("exact captured-ID cleanup contract", exact ? "passed" : "failed", exact ? "cleanup callback received only its captured exact ID" : "cleanup registry did not preserve the captured ID");
  } catch (error) {
    record("exact captured-ID cleanup contract", "failed", error instanceof Error ? error.message : error);
  }
} finally {
  const cleanupResults = await cleanupRegistry.run();
  const cleanupFailures = cleanupResults.filter((item) => item.status !== "passed");
  record("guaranteed production cleanup", cleanupFailures.length ? "failed" : "passed", `captured production IDs=${cleanupResults.length}; cleanup failures=${cleanupFailures.length}; discovery is read-only`);
}

if (normalUserId && academic?.chapter_id && progressBefore) {
  try {
    const progressAfter = readProgressSnapshot(normalUserId, academic.chapter_id);
    const progressHistoryAfter = readProgressHistoryCount(normalUserId, academic.chapter_id);
    const stateUnchanged = JSON.stringify(progressSnapshotComparable(progressBefore)) === JSON.stringify(progressSnapshotComparable(progressAfter));
    const historyUnchanged = progressHistoryBefore === progressHistoryAfter;
    record("post-discovery progress integrity", stateUnchanged && historyUnchanged ? "passed" : "failed", `current row unchanged=${stateUnchanged}; progress history unchanged=${historyUnchanged}`);
  } catch (error) {
    record("post-discovery progress integrity", "failed", error instanceof Error ? error.message : error);
  }
}

const fixtures = {
  marker,
  mutationUserHash: normalUserId ? digest(normalUserId) : null,
  moderatorUserHash: moderatorUserId ? digest(moderatorUserId) : null,
  community: community ? { channelHash: digest(community.id), slug: community.slug, scope: community.scope_type, writePolicy: community.write_policy } : null,
  academic: academic ? {
    levelCode: academic.level_code,
    groupCode: academic.group_code,
    subjectSlug: academic.subject_slug,
    syllabusHash: digest(academic.syllabus_version_id),
    chapterHash: digest(academic.chapter_id),
    chapterSlug: academic.chapter_slug,
  } : null,
  entitlement: entitlement ? {
    tierKey: entitlement.tier_key,
    billingCycle: entitlement.billing_cycle,
    entitlementCount: Number(entitlement.entitlement_count),
    enabledEntitlementCount: Number(entitlement.enabled_entitlement_count),
  } : null,
  r2: r2 ? { binding: r2.binding, bucketHash: digest(r2.bucket) } : null,
  progress: progressBefore ? { chapterHash: academic ? digest(academic.chapter_id) : null, ...progressStageSummary(progressBefore) } : null,
};

const requiredFailures = checks.filter((check) => check.required && check.status !== "passed");
const report = {
  schemaVersion: 1,
  phase: "phase-2-dynamic-fixtures-cleanup",
  status: requiredFailures.length ? "failed" : "passed",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || "local",
  workflowRun: process.env.GITHUB_RUN_ID || "local",
  marker,
  target: baseUrl,
  database,
  fixtures,
  summary: {
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
    unsupported: checks.filter((check) => check.status === "unsupported").length,
  },
  checks,
};

let serialized = JSON.stringify(report, null, 2);
const leakedSecret = sensitiveValues.find((secret) => secret.length >= 4 && serialized.includes(secret));
const leakedIdentity = observedIdentityValues.find((id) => id.length >= 4 && serialized.includes(id));
const leakedEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized);
if (leakedSecret || leakedIdentity || leakedEmail) {
  report.status = "failed";
  report.summary.failed += 1;
  report.checks.push({ name: "report privacy scan", status: "failed", required: true, evidence: "credential, raw identity, or email appeared in the report buffer" });
} else {
  report.checks.push({ name: "report privacy scan", status: "passed", required: true, evidence: "no configured credential, raw user identity, or email appears in the report" });
  report.summary.passed += 1;
}

serialized = JSON.stringify(report, null, 2);
await writeFile(REPORT_JSON, `${serialized}\n`);
await writeFile(REPORT_MARKDOWN, markdown(report));
console.log(`Phase 2 dynamic fixtures: ${report.status}; ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.unsupported} unsupported.`);
if (report.status !== "passed") process.exitCode = 1;
