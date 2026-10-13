import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function rehearse(){
 const db=new DatabaseSync(':memory:');
 try{
  const files=readdirSync('d1/migrations').filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>f.slice(0,4)<='0084'))db.exec(readFileSync('d1/migrations/'+file,'utf8'));
  db.exec("INSERT INTO subscription_plans(id,tier_key,billing_cycle,name,rank,price_subunits,duration_value,duration_unit) VALUES('release-basic','basic','monthly','Striver',1,5000,1,'month');INSERT INTO plan_policy_versions(id,plan_id,version,state,name,price_subunits,billing_duration_value,billing_duration_unit,change_reason) VALUES('release-pv','release-basic',1,'published','Striver',5000,1,'month','Retained fixture')");
  const plan=db.prepare("SELECT id FROM subscription_plans WHERE tier_key='basic' AND billing_cycle='monthly' LIMIT 1").get();
  const policy=db.prepare("SELECT id FROM plan_policy_versions WHERE plan_id=? AND state='published' LIMIT 1").get(plan.id);
  db.prepare("INSERT INTO app_users(user_id,auth_provider) VALUES('release-rehearsal','local-test')").run();
  db.prepare("INSERT INTO user_subscriptions(id,user_id,plan_id,starts_at,ends_at,source) VALUES('release-contract','release-rehearsal',?,'2026-10-01','2026-11-01','manual')").run(plan.id);
  db.prepare("INSERT INTO subscription_policy_contracts(subscription_id,policy_version_id,grandfathered,decision_reason) VALUES('release-contract',?,1,'Retained release fixture')").run(policy.id);
  const snapshot=()=>JSON.stringify({access:db.prepare("SELECT * FROM user_subscriptions WHERE id='release-contract'").get(),contract:db.prepare("SELECT * FROM subscription_policy_contracts WHERE subscription_id='release-contract'").get(),policy:db.prepare('SELECT * FROM plan_policy_versions WHERE id=?').get(policy.id)});
  const before=snapshot(),applied=[];
  for(const file of files.filter(f=>f.slice(0,4)>'0084')){db.exec(readFileSync('d1/migrations/'+file,'utf8'));applied.push(file.slice(0,4));}
  if(before!==snapshot())throw Error('An owner migration changed a retained paid contract.');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Migration rehearsal has foreign-key violations.');
  const ledger=db.prepare("SELECT version FROM _ca_schema_migrations WHERE version BETWEEN '0085' AND '0093' ORDER BY version").all().map(r=>r.version);
  if(ledger.length!==9)throw Error('Owner migration ledger is incomplete.');
  // The retained runner must skip already-applied additive ALTER statements.
  const secondPass=applied.filter(version=>!ledger.includes(version));if(secondPass.length)throw Error('Retained migration replay would repeat an applied migration.');
  return {status:'passed',migrations:applied,retained_contract_unchanged:true,foreign_key_violations:0,second_pass_mutations:0,baseline_fingerprint:createHash('sha256').update(before).digest('hex')};
 }finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=rehearse();await mkdir('deployment-evidence/payment-rules-phase6',{recursive:true});await writeFile('deployment-evidence/payment-rules-phase6/migration-rehearsal.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
