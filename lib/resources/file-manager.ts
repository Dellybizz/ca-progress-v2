import type { NoteCard, UploadCard } from './types';
import type { IcaiResourceCard } from '@/lib/icai/types';
export type FileKind='note'|'pdf'|'image'|'document'|'link'|'other';
export type ManagedFile={thumbnailMissing?:boolean;processingState?:string;workspaceBaseline?:Record<string,unknown>|null;key:string;id:string;name:string;filename:string;kind:FileKind;extension:string;size:number|null;modified:string;subjectIds:string[];subject:string;chapterId:string|null;chapter:string|null;owner:string;status:string;important:boolean;excerpt:string;href:string;previewUrl?:string;downloadUrl?:string;sourceUrl?:string;verifiedAt?:string;sourceName?:string;firstSeenAt?:string;canManage?:boolean;starred?:boolean;folderId?:string|null;trashedAt?:string|null;trashExpiresAt?:string|null;visibility?:"private"|"shared";searchText?:string;officialType?:string};
export function fileKind(mime:string,extension:string):FileKind {
  if(mime==='application/pdf'||extension.toLowerCase()==='pdf')return 'pdf';
  if(mime.startsWith('image/')||['png','jpg','jpeg','webp','gif','avif'].includes(extension.toLowerCase()))return 'image';
  if(/word|spreadsheet|presentation|text\//.test(mime)||['doc','docx','xls','xlsx','ppt','pptx','txt','csv'].includes(extension.toLowerCase()))return 'document';
  return 'other';
}
export function privateFiles(notes:NoteCard[],uploads:UploadCard[]):ManagedFile[] {
  return [...notes.map(note=>({key:`note:${note.id}`,id:note.id,name:note.title,filename:note.title,kind:'note' as const,extension:'NOTE',size:null,modified:note.updatedAt,subjectIds:note.subjectId?[note.subjectId]:[],subject:note.subjectTitle||'Unfiled',chapterId:note.chapterId,chapter:note.chapterTitle,owner:note.ownerLabel,status:note.isOwner?note.moderationStatus:'Community · Approved',important:false,searchText:[...note.tags,note.topicTitle||''].join(' '),excerpt:note.excerpt,href:`/notes/${encodeURIComponent(note.id)}`})),...uploads.map(file=>({key:`upload:${file.id}`,id:file.id,name:file.title,filename:file.originalFilename,kind:fileKind(file.mimeType,file.extension),extension:file.extension.toUpperCase(),size:file.sizeBytes,modified:file.updatedAt,subjectIds:file.subjectId?[file.subjectId]:[],subject:file.subjectTitle||'Unfiled',chapterId:file.chapterId,chapter:file.chapterTitle,owner:file.ownerLabel,status:file.isOwner?file.moderationStatus:'Community · Approved',important:Boolean(file.important),canManage:file.isOwner,visibility:file.visibility,excerpt:file.description||'',href:`/resources/${encodeURIComponent(file.id)}`,previewUrl:`/api/v1/resources/${encodeURIComponent(file.id)}/preview`,downloadUrl:`/api/v1/resources/${encodeURIComponent(file.id)}/access?download=1`}))];
}
export function officialFiles(resources:IcaiResourceCard[]):ManagedFile[] {
  return resources.map(file=>{
    let extension='';try{extension=new URL(file.officialUrl).pathname.match(/\.([a-z0-9]+)$/i)?.[1]||'';}catch{}
    const kind=fileKind('',extension);
    return {key:`official:${file.id}`,id:file.id,name:file.title,filename:file.title,kind:kind==='other'?'link':kind,extension:extension?extension.toUpperCase():'LINK',size:null,modified:file.lastChangedAt||file.lastVerifiedAt,subjectIds:file.subjects.map(s=>s.id),subject:file.subjects.map(s=>s.title).join(', ')||'General',chapterId:null,chapter:null,owner:file.sourceName,status:file.status,important:false,excerpt:file.summary||'',href:file.officialUrl,sourceUrl:file.sourceUrl,verifiedAt:file.lastVerifiedAt,firstSeenAt:file.firstSeenAt,sourceName:file.sourceName,officialType:file.type};
  });
}
export function fileTimestamp(value:string) {
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)?value.replace(' ','T')+'Z':value);
}
export type FileSort='name'|'modified'|'size'|'type';
export function sortFiles(files:ManagedFile[],sort:FileSort,direction:'asc'|'desc',secondary:FileSort|'none'='name') {
  const compare=(a:ManagedFile,b:ManagedFile,key:FileSort)=>key==='name'?a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}):key==='type'?a.kind.localeCompare(b.kind):key==='size'?(a.size??0)-(b.size??0):(fileTimestamp(a.modified)||0)-(fileTimestamp(b.modified)||0);
  return [...files].sort((a,b)=>{
    // Unknown sizes always follow known sizes in either direction.
    if(sort==='size'&&(a.size===null)!==(b.size===null))return a.size===null?1:-1;
    return compare(a,b,sort)*(direction==='asc'?1:-1)||(secondary==='none'?0:compare(a,b,secondary))||a.key.localeCompare(b.key);
  });
}
export function filesCsv(files:ManagedFile[]) {
  const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return [['Name','Type','Size bytes','Modified','Subject','Owner'],...files.map(f=>[f.name,f.extension,f.size,f.modified,f.subject,f.owner])].map(row=>row.map(cell).join(',')).join('\r\n');
}
