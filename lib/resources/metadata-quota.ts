import {resourceLocationId} from './location';
import type {HotD1Database} from '@/lib/data/d1/runtime';
export type ResourceMetadataInput={userId:string;title:string;description:string|null;subjectId:string|null;chapterId:string|null;originalFilename:string;safeFilename:string;storagePath:string;mimeType:string;extension:string;sizeBytes:number;visibility:'private'|'shared'};
export async function insertResourceWithinQuota(database:HotD1Database,input:ResourceMetadataInput,limitBytes:number|null,ownerLabel:string,storageBucket:string){
 const moderationStatus=input.visibility==='shared'?'pending':'private';
  return await database.prepare(`
    INSERT INTO uploaded_resources(id,owner_user_id,owner_label,title,description,subject_id,chapter_id,original_filename,safe_filename,storage_bucket,storage_path,mime_type,extension,size_bytes,visibility,moderation_status,published_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,NULL
    WHERE COALESCE((SELECT SUM(size_bytes) FROM uploaded_resources WHERE owner_user_id=?2),0)
      + COALESCE((SELECT SUM(size_bytes) FROM test_attempt_attachments WHERE user_id=?2),0)
      + COALESCE((SELECT SUM(expected_size_bytes) FROM r2_upload_intents WHERE user_id=?2 AND status='issued' AND julianday(expires_at)>julianday('now') AND object_key<>?11),0)
      + COALESCE((SELECT SUM(expected_size_bytes) FROM test_attachment_upload_intents WHERE user_id=?2 AND status='issued' AND julianday(expires_at)>julianday('now')),0)+?14<=COALESCE(?17,9223372036854775807)
      AND NOT EXISTS(SELECT 1 FROM uploaded_resources WHERE owner_user_id=?2 AND storage_path=?11)
    RETURNING id,moderation_status
  `).bind(crypto.randomUUID(),input.userId,ownerLabel,input.title,input.description,resourceLocationId(input.subjectId),resourceLocationId(input.chapterId),input.originalFilename,input.safeFilename,storageBucket,input.storagePath,input.mimeType,input.extension,input.sizeBytes,input.visibility,moderationStatus,limitBytes).first<{id:string;moderation_status:string}>();
}
