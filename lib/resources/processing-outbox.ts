import 'server-only';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {enqueueBackgroundJob,jobKey} from '@/lib/jobs/queue';
export async function dispatchResourceProcessing(resourceId?:string){
 const db=getHotD1Database();const rows=await db.prepare(`SELECT resource_id,owner_user_id FROM resource_processing_outbox WHERE dispatched_at IS NULL${resourceId?' AND resource_id=?1':''} LIMIT 20`).bind(...(resourceId?[resourceId]:[])).all<{resource_id:string;owner_user_id:string}>();
 for(const row of rows.results??[]){try{await enqueueBackgroundJob({type:'attachment-process',idempotencyKey:jobKey('attachment-process',row.owner_user_id,row.resource_id),payload:{resourceId:row.resource_id,userId:row.owner_user_id},createdBy:row.owner_user_id});await db.prepare('UPDATE resource_processing_outbox SET dispatched_at=CURRENT_TIMESTAMP,last_error=NULL WHERE resource_id=?1').bind(row.resource_id).run();}catch{await db.prepare("UPDATE resource_processing_outbox SET last_error='Processing delivery will retry' WHERE resource_id=?1").bind(row.resource_id).run();}}
}
