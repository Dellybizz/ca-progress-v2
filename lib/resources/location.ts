import type {HotD1Database} from '@/lib/data/d1/runtime';
export function resourceLocationId(value:unknown){if(typeof value!=='string')return null;const id=value.trim();return !id||id==='none'?null:id;}
export async function validateResourceLocation(db:HotD1Database,subject:unknown,chapter:unknown){
 const subjectId=resourceLocationId(subject),chapterId=resourceLocationId(chapter);
 if(chapterId&&!subjectId)throw Error('Choose a subject before choosing a chapter.');
 if(subjectId&&!await db.prepare('SELECT id FROM subjects WHERE id=?1 LIMIT 1').bind(subjectId).first())throw Error('The selected subject is no longer available.');
 if(chapterId&&!await db.prepare('SELECT c.id FROM chapters c JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id WHERE c.id=?1 AND sv.subject_id=?2 LIMIT 1').bind(chapterId,subjectId).first())throw Error('The selected chapter does not belong to this subject or is no longer available.');
 return {subjectId,chapterId};
}
