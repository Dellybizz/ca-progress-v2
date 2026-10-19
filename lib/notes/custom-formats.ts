import {DEFAULT_LAYOUT,validateStructuredNote,renderStructuredNote,type NoteNode} from './structured-document';
import {normalizeWorkingNotes,workingNoteIndex} from './working-notes';
import {blankFinancial} from './financial-formats';
export type CustomFormat={version:1;id:string;name:string;nodes:NoteNode[]};
function document(nodes:NoteNode[]){return {schemaVersion:1,engine:'tiptap',engineSchemaVersion:1,kind:'document',entryId:'custom-format',revisionId:'custom-format',content:{type:'doc',content:nodes},attachmentIds:[],sourceAttribution:null,layout:DEFAULT_LAYOUT};}
export function validateCustomFormat(value:unknown):CustomFormat{
 if(!value||typeof value!=='object')throw Error('Invalid saved format.');const f=value as CustomFormat;if(f.version!==1||typeof f.id!=='string'||!/^[-\w]{1,80}$/.test(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>80||!Array.isArray(f.nodes)||f.nodes.length>64||f.nodes.filter(n=>['table','diagram','account'].includes(n.type)).length!==1||f.nodes.some(n=>!['table','diagram','account','paragraph','heading','workingNote'].includes(n.type))||JSON.stringify(f).length>100000)throw Error('Use a name up to 80 characters and one table or diagram per format.');
 const targets=new Set(workingNoteIndex({type:'doc',content:f.nodes}).map(n=>n.id));const check=(n:NoteNode)=>{if(n.attrs?.workingTarget&&!targets.has(String(n.attrs.workingTarget)))throw Error('Include every linked working note in this format.');n.content?.forEach(check);};f.nodes.forEach(check);
 validateStructuredNote(document(f.nodes));renderStructuredNote(validateStructuredNote(document(f.nodes)));return f;
}
export function instantiateFormat(format:CustomFormat,blank=false):NoteNode[]{
 validateCustomFormat(format);const nodes=structuredClone(format.nodes),ids=new Map<string,string>();const collect=(n:NoteNode)=>{if(n.attrs?.blockId)ids.set(String(n.attrs.blockId),'block-'+crypto.randomUUID());n.content?.forEach(collect);};nodes.forEach(collect);
 const copy=(node:NoteNode):NoteNode=>{const n=blank&&node.type==='table'&&node.attrs?.caFormat?blankFinancial(node):node;if(n.attrs){n.attrs={...n.attrs};if(node.attrs?.blockId)n.attrs.blockId=node.attrs.blockId;if(n.attrs.blockId)n.attrs.blockId=ids.get(String(n.attrs.blockId))??'block-'+crypto.randomUUID();if(n.attrs.caOwner)n.attrs.caOwner=ids.get(String(n.attrs.caOwner))??null;if(n.type==='reference'&&n.attrs.workingTarget&&!n.attrs.blockId)n.attrs.blockId='block-'+crypto.randomUUID();if(n.attrs.workingTarget){n.attrs.workingTarget=ids.get(String(n.attrs.workingTarget));n.attrs.href='#'+n.attrs.workingTarget;}}if(n.marks)n.marks=n.marks.map(m=>{if(m.type==='link'&&typeof m.attrs?.href==='string'&&m.attrs.href.startsWith('#'))return {...m,attrs:{...m.attrs,href:'#'+(ids.get(m.attrs.href.slice(1))??m.attrs.href.slice(1))}};return m;});if(n.content)n.content=n.content.map(copy);return n;};
 return normalizeWorkingNotes({type:'doc',content:nodes.map(copy)}).content!;
}
export function customFormatHTML(format:CustomFormat){return renderStructuredNote(validateStructuredNote(document(format.nodes)));}
export const customFormatKey=(owner:string,context:string)=>'ca-notes:formats:v1:'+JSON.stringify([owner,context]);
export function readCustomFormats(storage:Pick<Storage,'getItem'>,key:string):CustomFormat[]{const raw=storage.getItem(key);if(!raw)return [];if(raw.length>1000000)throw Error('Saved formats exceed the device limit.');const data=JSON.parse(raw);if(!Array.isArray(data)||data.length>20)throw Error('Saved formats could not be read.');const formats=data.map(validateCustomFormat);if(new Set(formats.map(f=>f.id)).size!==formats.length)throw Error('Saved format identities are invalid.');return formats;}
export function writeCustomFormat(storage:Pick<Storage,'getItem'|'setItem'>,key:string,format:CustomFormat){validateCustomFormat(format);const current=readCustomFormats(storage,key);if(current.some(f=>f.id!==format.id&&f.name.trim().toLocaleLowerCase()===format.name.trim().toLocaleLowerCase()))throw Error('A format already has that name.');const next=[...current.filter(f=>f.id!==format.id),format];if(next.length>20||JSON.stringify(next).length>1000000)throw Error('Keep up to 20 formats within 1 MB on this device.');storage.setItem(key,JSON.stringify(next));return next;}
export function deleteCustomFormat(storage:Pick<Storage,'getItem'|'setItem'>,key:string,id:string){const next=readCustomFormats(storage,key).filter(f=>f.id!==id);storage.setItem(key,JSON.stringify(next));return next;}

/** Capture the closure of working-note links, never unrelated document contents. */
export function withLinkedWorkings(nodes:NoteNode[],root:NoteNode):NoteNode[]{
 const available=new Map<string,NoteNode>();const scan=(n:NoteNode)=>{if(n.type==='workingNote')available.set(String(n.attrs?.blockId),n);n.content?.forEach(scan);};scan(root);
 const result=[...nodes],included=new Set(nodes.filter(n=>n.type==='workingNote').map(n=>String(n.attrs?.blockId)));
 const follow=(n:NoteNode)=>{const target=n.attrs?.workingTarget;if(target&&!included.has(String(target))){const working=available.get(String(target));if(!working)throw Error('Repair the missing working note before saving this format.');included.add(String(target));result.push(working);follow(working);}n.content?.forEach(follow);};nodes.forEach(follow);return result;
}
export function serializeCustomFormats(formats:CustomFormat[]){if(formats.length>20)throw Error('Export up to 20 formats.');formats.forEach(validateCustomFormat);const data=JSON.stringify({kind:'ca-progress-formats',version:1,formats},null,2);if(new TextEncoder().encode(data).length>1000000)throw Error('Formats exceed 1 MB.');return data;}
export function importCustomFormats(storage:Pick<Storage,'getItem'|'setItem'>,key:string,text:string){
 if(text.length>1000000||new TextEncoder().encode(text).length>1000000)throw Error('Import a formats file up to 1 MB.');let bundle;try{bundle=JSON.parse(text);}catch{throw Error('This is not a valid formats file.');}
 if(bundle?.kind!=='ca-progress-formats'||bundle.version!==1||!Array.isArray(bundle.formats)||!bundle.formats.length||bundle.formats.length>20)throw Error('Use a CA Progress formats export.');
 const incoming=bundle.formats.map(validateCustomFormat),current=readCustomFormats(storage,key),next=[...current];for(const format of incoming){let name=format.name,n=2;while(next.some(f=>f.name.toLocaleLowerCase()===name.toLocaleLowerCase())){const suffix=' ('+(n++)+')';name=format.name.slice(0,80-suffix.length)+suffix;}next.push({...format,id:crypto.randomUUID(),name});}
 if(next.length>20||JSON.stringify(next).length>1000000)throw Error('Keep up to 20 formats within 1 MB. No formats were imported.');storage.setItem(key,JSON.stringify(next));return next;
}
