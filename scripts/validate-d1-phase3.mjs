import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const persistTo = mkdtempSync(join(tmpdir(), "ca-progress-d1-phase3-"));
const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
const base = ["wrangler", "--config", "wrangler.phase3.jsonc"];
const database = "ca-progress-v2-phase3-local";

function run(args) {
  return execFileSync(wrangler, [...base, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1", NO_D1_WARNING: "true" },
  });
}

function execute(command) {
  const output = run(["d1", "execute", database, "--local", "--persist-to", persistTo, "--command", command, "--json"]);
  return JSON.parse(output)?.[0]?.results ?? [];
}

try {
  run(["d1", "migrations", "apply", database, "--local", "--persist-to", persistTo]);

  const tables = execute("SELECT name,type FROM sqlite_master WHERE name IN ('users','auth_identities','sessions','background_job_executions') ORDER BY name;");
  const names = tables.map((row) => `${row.type}:${row.name}`);
  for (const expected of ["table:auth_identities","table:background_job_executions","table:sessions","view:users"]) {
    if (!names.includes(expected)) throw new Error(`Missing Phase 3 D1 object ${expected}`);
  }

  execute("INSERT INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES('supabase-user-stable-001','supabase',NULL,'active','student');");
  execute("INSERT INTO auth_identities(identity_id,provider,provider_user_id,application_user_id,email_verified) VALUES('identity-google-001','google','google-sub-abc','supabase-user-stable-001',1);");
  const mapped = execute("SELECT application_user_id FROM auth_identities WHERE provider='google' AND provider_user_id='google-sub-abc';");
  if (mapped?.[0]?.application_user_id !== "supabase-user-stable-001") throw new Error("Existing user identity did not preserve the stable application user id.");

  execute("INSERT INTO sessions(session_id,application_user_id,auth_identity_id,token_hash,remember_device,expires_at,absolute_expires_at) VALUES('session-001','supabase-user-stable-001','identity-google-001','hashed-token-only',1,'2099-01-01T00:00:00.000Z','2099-02-01T00:00:00.000Z');");
  const session = execute("SELECT application_user_id,token_hash FROM sessions WHERE session_id='session-001';");
  if (session?.[0]?.application_user_id !== "supabase-user-stable-001" || session?.[0]?.token_hash !== "hashed-token-only") throw new Error("Worker session did not retain application ownership/token hash.");

  execute("INSERT INTO background_job_executions(idempotency_key,job_type,payload_hash,status) VALUES('icai-sync:2099-01-01','icai-sync','payload-hash','succeeded');");
  let duplicateRejected = false;
  try {
    execute("INSERT INTO background_job_executions(idempotency_key,job_type,payload_hash,status) VALUES('icai-sync:2099-01-01','icai-sync','different-payload','queued');");
  } catch {
    duplicateRejected = true;
  }
  if (!duplicateRejected) throw new Error("Queue idempotency key uniqueness was not enforced.");

  const fkRows = execute("PRAGMA foreign_key_check;");
  if (fkRows.length) throw new Error(`D1 foreign_key_check returned ${fkRows.length} violations`);

  run(["d1", "migrations", "apply", database, "--local", "--persist-to", persistTo]);
  console.log("Phase 3 D1 auth/job bootstrap PASS (stable mapping, hashed session storage, job idempotency, clean FKs). ");
} finally {
  rmSync(persistTo, { recursive: true, force: true });
}
