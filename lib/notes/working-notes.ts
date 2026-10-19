import type {NoteNode} from './structured-document';
export function workingNoteIndex(root:NoteNode){
 const notes:{id:string;number:number;title:string;backlinks:string[]}[]=[],references:{target:string;id:string}[]=[];
 const text=(n:NoteNode):string=>n.text??(n.content??[]).map(text).join('');
 const visit=(n:NoteNode)=>{if(n.type==='workingNote')notes.push({id:String(n.attrs?.blockId??''),number:notes.length+1,title:text(n.content?.[0]??{type:'paragraph'}),backlinks:[]});if(n.type==='reference'&&n.attrs?.workingTarget)references.push({target:String(n.attrs.workingTarget),id:String(n.attrs.blockId??'')});n.content?.forEach(visit);};visit(root);
 for(const note of notes)note.backlinks=references.filter(r=>r.target===note.id&&r.id).map(r=>r.id).slice(0,80);return notes;
}
export function normalizeWorkingNotes(root:NoteNode):NoteNode{
 const index=new Map(workingNoteIndex(root).map(n=>[n.id,n]));
 const visit=(n:NoteNode):NoteNode=>{let attrs=n.attrs;if(n.type==='workingNote'){const note=index.get(String(attrs?.blockId));if(note)attrs={...attrs,number:note.number,backlinks:note.backlinks};}if(n.type==='reference'&&attrs?.workingTarget){const note=index.get(String(attrs.workingTarget));attrs={...attrs,href:'#'+attrs.workingTarget,label:note?'W.N. '+note.number:'Missing working note'};}return {...n,...(attrs?{attrs}:{}),...(n.content?{content:n.content.map(visit)}:{})};};return visit(root);
}
export function createWorkingNote(title:string,id='block-'+crypto.randomUUID()):NoteNode{
 if(!title.trim()||title.trim().length>160)throw Error('Use a working-note title up to 160 characters.');return {type:'workingNote',attrs:{blockId:id,number:1,backlinks:[]},content:[{type:'heading',attrs:{level:3},content:[{type:'text',text:title.trim()}]},{type:'paragraph'}]};
}
