const normalize=sql=>String(sql).replace(/\s+/g,' ').trim().replace(/;$/,'').toLowerCase();
export const p5SchemaNames=['billing_notifications','billing_notifications_owner','billing_recovery_due','billing_failure_anchor','billing_notice_financial_hold'];
export function verifyP5MigrationLayout(sql,objects,columns){
 if(!columns.some(c=>c.name==='failure_paid_through_at'&&c.type==='TEXT'))throw new Error('Phase 5 failure anchor is missing or incompatible.');
 for(const name of p5SchemaNames){
  const object=objects.find(row=>row.name===name);
  if(!object||!['table','index','trigger'].includes(object.type))throw new Error(`Phase 5 schema is incomplete: ${name}`);
  const ending=object.type==='trigger'?'END;':';';
  const expected=sql.match(new RegExp(`CREATE ${object.type} ${name}\\b[\\s\\S]*?${ending}`,'i'))?.[0];
  if(!expected||normalize(expected)!==normalize(object.sql))throw new Error(`Phase 5 schema differs from the migration: ${name}`);
 }
 return true;
}
