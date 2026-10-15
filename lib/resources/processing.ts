import type {HotD1Database} from '@/lib/data/d1/runtime';
import type {ResourceR2Bucket} from './r2';
import {boundedBytes,contentHash,inspectBytes,INSPECTION_MAX_BYTES} from './inspection';
export function textThumbnail(text:string,label:string){
 const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
 const lines=text.trim().replace(/\s+/g,' ').match(/.{1,43}(?:\s|$)|.{1,43}/gu)?.slice(0,11)??['Open to read this file'];
 return `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="288" viewBox="0 0 384 288"><rect width="384" height="288" rx="12" fill="#fafcff"/><rect x="0" y="0" width="384" height="43" fill="#e4ecfa"/><text x="20" y="28" font-family="sans-serif" font-size="14" fill="#234572">${escape(label)}</text>${lines.map((line,i)=>`<text x="20" y="${67+i*19}" font-family="sans-serif" font-size="12" fill="#233248">${escape(line)}</text>`).join('')}</svg>`;
}
export async function processResource(resourceId:string,owner:string,db:HotD1Database,bucket:ResourceR2Bucket){
 const row=await db.prepare("SELECT u.id,u.storage_path,u.mime_type,u.extension,u.size_bytes,u.owner_user_id,u.visibility,u.moderation_status FROM uploaded_resources u WHERE u.id=?1 AND u.owner_user_id=?2 AND NOT EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.entity_kind='upload' AND w.entity_id=u.id AND w.trashed_at IS NOT NULL)").bind(resourceId,owner).first<{id:string;storage_path:string;mime_type:string;extension:string;size_bytes:number;owner_user_id:string;visibility:string;moderation_status:string}>();
 if(!row)return {state:'missing'};row.extension=row.extension.toLowerCase();
 const stored=await bucket.get(row.storage_path);if(!stored)throw Error('Source bytes are unavailable.');
 const old=await db.prepare('SELECT * FROM resource_inspections WHERE resource_id=?1').bind(resourceId).first<{source_key:string;source_etag:string;state:string;thumbnail_key:string|null}>();
 if(old&&old.source_key===row.storage_path&&old.source_etag===stored.httpEtag&&['ready','unsupported','quarantined'].includes(old.state))return {state:old.state};
 await db.prepare("INSERT INTO resource_inspections(resource_id,owner_user_id,source_key,source_etag,content_sha256,state,attempts) VALUES(?1,?2,?3,?4,'','processing',1) ON CONFLICT(resource_id) DO UPDATE SET state='processing',attempts=resource_inspections.attempts+1,last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(resourceId,owner,row.storage_path,stored.httpEtag).run();
 try{
  const bytes=await boundedBytes(stored.body,INSPECTION_MAX_BYTES);if(bytes.length!==row.size_bytes)throw Error('Source size changed.');const inspected=inspectBytes(bytes,row.extension.toLowerCase());const hash=await contentHash(bytes);let text=inspected.text,state:'ready'|'unsupported'='unsupported';
  if(row.extension==='docx')state='ready';
  if(row.extension==='pdf'){
   const {getDocumentProxy}=await import('unpdf');const pdf=await getDocumentProxy(bytes,{disableFontFace:true,useSystemFonts:false,disableAutoFetch:true});
   try{if(pdf.numPages>300)throw Error('PDF page count exceeds the preview budget.');if(await pdf.getJSActions())throw Error('PDF active actions are not allowed in previews.');
    const parts:string[]=[];for(let page=1;page<=Math.min(pdf.numPages,20);page++){const loaded=await pdf.getPage(page);const content=await loaded.getTextContent();parts.push(content.items.map(item=>'str' in item?item.str:'').join(' '));loaded.cleanup();if(parts.join('\n').length>128000)break;}text=parts.join('\n').slice(0,128000);state=text.trim()?'ready':'unsupported';
   }finally{await pdf.loadingTask.destroy();}
  }
  let thumbnail:string|null=null;let thumbBytes=0;
  if(text){thumbnail=`derivatives/${owner}/${resourceId}/${hash}/text.svg`;const svg=textThumbnail(text,row.extension.toUpperCase());thumbBytes=new TextEncoder().encode(svg).length;await bucket.put(thumbnail,svg,{httpMetadata:{contentType:'image/svg+xml',cacheControl:'private, no-store'},customMetadata:{owner,sourceHash:hash}});}
  if(row.mime_type.startsWith('image/')){state='ready';thumbnail=null;}
  // The derivative and text are published only while the exact source is current.
  const current=await bucket.head?.(row.storage_path);if(!current||current.httpEtag!==stored.httpEtag)throw Error('Source changed during processing.');
  await db.prepare("UPDATE resource_inspections SET content_sha256=?1,state=?2,text_content=?3,thumbnail_key=CASE WHEN thumbnail_mime='image/png' AND content_sha256=?1 THEN thumbnail_key ELSE COALESCE(?4,thumbnail_key) END,thumbnail_mime=CASE WHEN thumbnail_mime='image/png' AND content_sha256=?1 THEN thumbnail_mime WHEN ?4 IS NOT NULL THEN 'image/svg+xml' ELSE thumbnail_mime END,thumbnail_bytes=CASE WHEN thumbnail_mime='image/png' AND content_sha256=?1 THEN thumbnail_bytes WHEN ?4 IS NOT NULL THEN ?5 ELSE thumbnail_bytes END,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE resource_id=?6 AND source_key=?7 AND source_etag=?8").bind(hash,state,text,thumbnail,thumbBytes,resourceId,row.storage_path,stored.httpEtag).run();
  if(thumbnail){const published=await db.prepare('SELECT thumbnail_key FROM resource_inspections WHERE resource_id=?1').bind(resourceId).first<{thumbnail_key:string|null}>();if(published?.thumbnail_key!==thumbnail)await db.prepare('INSERT OR IGNORE INTO resource_derivative_cleanup(object_key,owner_user_id) VALUES(?1,?2)').bind(thumbnail,owner).run();}
  if(old?.thumbnail_key&&thumbnail&&old.thumbnail_key!==thumbnail)await db.prepare('INSERT OR IGNORE INTO resource_derivative_cleanup(object_key,owner_user_id) VALUES(?1,?2)').bind(old.thumbnail_key,owner).run();await db.prepare("INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action,detail) VALUES(?1,'upload',?2,'processed',?3)").bind(owner,resourceId,state).run();return {state};
 }catch(error){
  const message=error instanceof Error?error.message:'File processing failed.';
  if(/Password|encrypted/i.test(message)){await db.prepare("UPDATE resource_inspections SET state='unsupported',text_content='',last_error='Password-protected preview is unavailable.',updated_at=CURRENT_TIMESTAMP WHERE resource_id=?1").bind(resourceId).run();return {state:'unsupported'};}
  await db.prepare("UPDATE resource_inspections SET state='quarantined',text_content='',last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE resource_id=?2").bind(message.slice(0,240),resourceId).run();return {state:'quarantined'};
 }
}
