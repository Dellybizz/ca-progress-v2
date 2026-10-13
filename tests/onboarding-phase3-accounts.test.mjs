import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
async function moduleAt(entry){const dir=await mkdtemp(path.join(process.cwd(),'.phase3-test-'));const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'}});const file=path.join(dir,'module.mjs');await writeFile(file,result.outputFiles[0].text);return {module:await import('file://'+file),cleanup:()=>rm(dir,{recursive:true,force:true})};}
test('account UI retains native form semantics, real password rules and honest verification',async()=>{const {module:c,cleanup}=await moduleAt('components/auth/onboarding/accounts.tsx');try{
 const props={onBack(){},onSave:async()=>{},assignedUsername:'student_example'};const setup=renderToStaticMarkup(React.createElement(c.AccountCredentials,props));assert.match(setup,/minLength="12"/);assert.match(setup,/new-password/);assert.match(setup,/Availability is checked when you save/);assert.doesNotMatch(setup,/username is available|at least 8|account verified/i);
 const offline=renderToStaticMarkup(React.createElement(c.AccountCredentials,{...props,online:false}));assert.match(offline,/Passwords are not saved as offline drafts/);assert.match(offline,/<button[^>]*disabled=""[^>]*>Save and continue/);
 const login=renderToStaticMarkup(React.createElement(c.AccountLogin,{onBack(){},onLogin:async()=>{},onProvider(){},onRecovery(){},onSignup(){},onGuest:async()=>{}}));assert.match(login,/current-password/);assert.match(login,/Forgot password/);assert.match(login,/Continue as Guest/);
 const recovery=renderToStaticMarkup(React.createElement(c.AccountRecovery,{onBack(){},onProvider(){},online:false}));assert.match(recovery,/already linked/);assert.match(recovery,/<button[^>]*disabled=""[^>]*>Verify with Google/);
 }finally{await cleanup();}});
test('single-use recovery SQL isolates accounts, rejects stale proofs and revokes web/native sessions atomically',async()=>{const {module:s,cleanup}=await moduleAt('lib/auth/recovery-sql.ts');try{
 const script=`import sqlite3,json,sys
x=json.load(sys.stdin);d=sqlite3.connect(':memory:');d.executescript("CREATE TABLE app_users(user_id TEXT PRIMARY KEY,account_state TEXT);CREATE TABLE auth_identities(identity_id TEXT PRIMARY KEY,application_user_id TEXT,provider TEXT);CREATE TABLE password_credentials(user_id TEXT PRIMARY KEY,username TEXT,salt TEXT,password_hash TEXT,iterations INTEGER,updated_at TEXT);CREATE TABLE sessions(session_id TEXT,application_user_id TEXT,revoked_at TEXT);CREATE TABLE native_auth_transactions(application_user_id TEXT,consumed_at TEXT);CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);");d.executescript(x['migration'])
def seed():
 for table in ['password_recovery_proofs','auth_identities','password_credentials','sessions','native_auth_transactions','app_users']:d.execute('DELETE FROM '+table)
 d.executemany('INSERT INTO app_users VALUES(?,?)',[('a','active'),('b','active')]);d.executemany('INSERT INTO auth_identities VALUES(?,?,?)',[('ia','a','google'),('ib','b','linkedin_oidc')]);d.executemany('INSERT INTO password_credentials VALUES(?,?,?,?,?,?)',[(u,u,'salt','old-'+u,310000,'old') for u in ['a','b']]);d.executemany('INSERT INTO sessions VALUES(?,?,NULL)',[('web-a','a'),('native-a','a'),('web-b','b')]);d.executemany('INSERT INTO native_auth_transactions VALUES(?,NULL)',[('a',),('b',)]);d.execute("INSERT INTO password_recovery_proofs(token_hash,user_id,identity_id,credential_hash,expires_at) VALUES('token','a','ia','old-a','2099-01-01')");d.commit()
def reset(user='a',claim='claim1',fail=False):
 with d:
  d.execute(x['claimRecoverySql'],(claim,'token',user));rows=d.execute(x['updateRecoveryPasswordSql'],('new-salt','new-hash',310000,user,'token',claim)).fetchall()
  if fail:raise Exception('rollback')
  d.execute(x['revokeRecoverySessionsSql'],(user,'token',claim));d.execute(x['invalidateRecoveryNativeSql'],(user,'token',claim));d.execute(x['invalidateRecoveryProofsSql'],(claim,user,'token'))
 return rows
seed();assert reset('b')==[];assert d.execute("SELECT password_hash FROM password_credentials WHERE user_id='b'").fetchone()[0]=='old-b'
assert reset()==[('a',)];assert reset(claim='claim2')==[];assert d.execute("SELECT COUNT(*) FROM sessions WHERE application_user_id='a' AND revoked_at IS NULL").fetchone()[0]==0;assert d.execute("SELECT COUNT(*) FROM sessions WHERE application_user_id='b' AND revoked_at IS NULL").fetchone()[0]==1;assert d.execute("SELECT consumed_at FROM native_auth_transactions WHERE application_user_id='a'").fetchone()[0] is not None
for mutation in ["UPDATE password_recovery_proofs SET expires_at='2000-01-01'","UPDATE password_credentials SET password_hash='changed' WHERE user_id='a'","UPDATE app_users SET account_state='disabled' WHERE user_id='a'","DELETE FROM auth_identities WHERE identity_id='ia'","UPDATE auth_identities SET application_user_id='b' WHERE identity_id='ia'","UPDATE auth_identities SET provider='password' WHERE identity_id='ia'"]:
 seed();d.execute(mutation);d.commit();assert reset()==[];assert d.execute("SELECT COUNT(*) FROM sessions WHERE application_user_id='a' AND revoked_at IS NULL").fetchone()[0]==2
seed()
try:reset(fail=True)
except Exception:pass
assert d.execute("SELECT consumed_by FROM password_recovery_proofs").fetchone()[0] is None;assert d.execute("SELECT password_hash FROM password_credentials WHERE user_id='a'").fetchone()[0]=='old-a';assert reset()==[('a',)]
`;
 const input={...s,migration:await readFile('d1/migrations/0093_provider_password_recovery.sql','utf8')};const run=spawnSync('python3',['-c',script],{encoding:'utf8',input:JSON.stringify(input)});assert.equal(run.status,0,run.stderr);
 }finally{await cleanup();}});
test('recovery callback skips provisioning and credentials never enter local drafts',async()=>{const auth=await readFile('lib/auth/cloudflare.ts','utf8');const recovery=auth.slice(auth.indexOf('if(transaction.purpose==="recovery")'),auth.indexOf('const identity = await resolveApplicationIdentity(profile);',auth.indexOf('if(transaction.purpose==="recovery")')));assert.match(recovery,/issuePasswordRecovery/);assert.doesNotMatch(recovery,/resolveApplicationIdentity|issueSession|ensureCloudflareUserBootstrap/);const source=await readFile('components/auth/onboarding/accounts.tsx','utf8');assert.doesNotMatch(source,/localStorage|sessionStorage/);const bundle=await build({entryPoints:['apps/mobile/src/account-setup.tsx'],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',loader:{'.css':'empty'}});assert.doesNotMatch(bundle.outputFiles[0].text,/next\/navigation|server-only/);});

test('verified new accounts choose their login before study setup and completed accounts keep their destination',async()=>{const {module:c,cleanup}=await moduleAt('lib/auth/account-entry.ts');try{
 const next=c.accountEntryDestination('/dashboard',true,false);assert.equal(next,'/account/setup?next='+encodeURIComponent('/onboarding?next='+encodeURIComponent('/dashboard')));
 assert.equal(c.accountEntryDestination('/onboarding',true,false),'/account/setup?next=%2Fonboarding');
 assert.equal(c.accountEntryDestination('/dashboard',false,true),'/dashboard');
 assert.equal(c.accountEntryDestination('/dashboard',false,false),'/onboarding?next=%2Fdashboard');
 assert.equal(c.accountEntryDestination('/dashboard',true,true),'/account/setup?next=%2Fdashboard');
 assert.equal(c.accountEntryDestination('/account/setup',true,false),'/account/setup');
 assert.equal(c.accountEntryDestination('//external.test',false,true),'/planner/today');
 }finally{await cleanup();}});
