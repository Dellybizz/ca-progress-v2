'use client';
import dynamic from 'next/dynamic';
import {readStructuredNote} from '@/lib/notes/structured-document';
import type {CommunityNoteDraft,NoteSubjectOption} from '@/lib/notes/types';
import type {NoteCard,UploadCard} from '@/lib/resources/types';
export type NoteEditorProps={note?:NoteCard|null;subjects:NoteSubjectOption[];availableUploads?:UploadCard[];communityDraft?:CommunityNoteDraft|null;compact?:boolean;onSaved?:()=>void;initialSubjectId?:string;initialChapterId?:string;onDirtyChange?:(dirty:boolean)=>void};
const Studio=dynamic(()=>import('@/components/notes/note-studio').then(module=>module.NoteStudio),{ssr:false,loading:()=> <div className="note-editor-placeholder" role="status" aria-label="Opening note editor"><span/></div>});
export function NoteEditor(props:NoteEditorProps){
 let structured=false;try{structured=JSON.parse(props.note?.documentJson??'null')?.engine==='tiptap';}catch{}
 if(structured&&!readStructuredNote(props.note?.documentJson))return <div role="alert">This document needs a newer editor. Its saved content is retained. Refresh CA Progress before editing.</div>;
 return <Studio {...props}/>;
}
