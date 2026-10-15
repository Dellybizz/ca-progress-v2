// One-time repair for the failed upload certification on 15 Oct 2026, 03:06 UTC.
// Never a general bucket cleaner: only disabled manual-test fixtures in this
// narrow window, with the exact synthetic bytes and no database references.
export const FIXTURE_SIZE=12*1024*1024+123;
export const FIXTURE_HASH='9ed331a08844709f7ba41310c8ae8646658fd4f561b0d34e78545542fda5a592';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sql=`SELECT u.user_id,n.username FROM app_users u JOIN profiles p ON p.user_id=u.user_id JOIN account_usernames n ON n.user_id=u.user_id WHERE u.auth_provider='manual-test' AND u.account_state='disabled' AND p.display_name='Upload verification fixture' AND julianday(u.created_at)>=julianday('2026-10-15T03:06:00Z') AND julianday(u.created_at)<julianday('2026-10-15T03:07:00Z')`;
async function referenced(db,key){return Boolean(await db.prepare(`SELECT 1 found WHERE EXISTS(SELECT 1 FROM uploaded_resources WHERE storage_path=?1) OR EXISTS(SELECT 1 FROM r2_upload_intents WHERE object_key=?1) OR EXISTS(SELECT 1 FROM test_attempt_attachments WHERE object_key=?1) OR EXISTS(SELECT 1 FROM test_attachment_upload_intents WHERE object_key=?1) OR EXISTS(SELECT 1 FROM resource_inspections WHERE source_key=?1) OR EXISTS(SELECT 1 FROM storage_cleanup_deletions WHERE object_key=?1)`).bind(key).first());}
export async function auditFixtureObjects({DB,BUCKET},{apply=false}={}){
 const owners=(await DB.prepare(sql).all()).results||[];
 if(owners.length>1)throw Error('Ambiguous historical fixture account; refusing cleanup.');
 const report={mode:apply?'apply':'audit',fixture_accounts:owners.length,objects_seen:0,verified_orphans:0,deleted:0,retained:0,remaining_verified_orphans:0};
 for(const owner of owners){
  if(!uuid.test(owner.user_id)||!/^upload_[a-f0-9]{12}$/.test(owner.username))throw Error('Fixture owner identity mismatch; nothing further will be deleted.');
  let cursor;
  do{
   const page=await BUCKET.list({prefix:`files/${owner.user_id}/`,limit:100,cursor});
   // List then verify; no deletion until all keys on this page are captured.
   for(const object of page.objects){
    report.objects_seen++;const parts=object.key.split('/');
    if(parts.length!==4||parts[0]!=='files'||parts[1]!==owner.user_id||!uuid.test(parts[2])||parts[3]!=='upload-verification.pdf'||object.size!==FIXTURE_SIZE||await referenced(DB,object.key)){report.retained++;continue;}
    const source=await BUCKET.get(object.key);if(!source||source.size!==FIXTURE_SIZE){report.retained++;continue;}
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await source.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(digest!==FIXTURE_HASH){report.retained++;continue;}
    report.verified_orphans++;
    if(!apply){report.remaining_verified_orphans++;continue;}
    const stillDisabled=await DB.prepare("SELECT 1 ok FROM app_users WHERE user_id=?1 AND auth_provider='manual-test' AND account_state='disabled'").bind(owner.user_id).first();
    const head=await BUCKET.head(object.key);
    if(!stillDisabled||await referenced(DB,object.key)||!head||head.size!==FIXTURE_SIZE||head.etag!==source.etag){report.retained++;report.remaining_verified_orphans++;continue;}
    await BUCKET.delete(object.key);
    if(await BUCKET.head(object.key))throw Error('Fixture object deletion could not be verified.');
    report.deleted++;
   }
   cursor=page.truncated?page.cursor:undefined;
   if(page.truncated&&!cursor)throw Error('Incomplete fixture object inventory.');
  }while(cursor);
 }
 return report;
}
