'use client';
import {useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {ManagedFile} from '@/lib/resources/file-manager';
import type {NoteSubjectOption} from '@/lib/notes/types';
export function FileOrganization({file,subjects,onSaved}:{file:ManagedFile;subjects:NoteSubjectOption[];onSaved:()=>void}) {
  const router=useRouter();const pending=useRef(false);const [busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState(file.name),[subjectId,setSubjectId]=useState(file.subjectIds[0]||''),[chapterId,setChapterId]=useState(file.chapterId||'');
  const subject=subjects.find(item=>item.id===subjectId);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');try{
    const response=await fetch(`/api/v1/resources/${encodeURIComponent(file.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:name.trim(),description:file.excerpt,subjectId:subjectId||null,chapterId:chapterId||null,visibility:file.visibility})});
    const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||'Could not update this file.');onSaved();router.refresh();
  }catch(caught){setError(caught instanceof Error?caught.message:'Could not update this file.');}finally{pending.current=false;setBusy(false);}}
  return <details className="fm-organize"><summary>Rename or move file</summary><form onSubmit={save}><fieldset disabled={busy}><label>Display name<input required maxLength={160} value={name} onChange={event=>setName(event.target.value)}/></label><label>Subject folder<select value={subjectId} onChange={event=>{setSubjectId(event.target.value);setChapterId('');}}><option value="">Unfiled</option>{subjects.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Chapter<select disabled={busy||!subject} value={chapterId} onChange={event=>setChapterId(event.target.value)}><option value="">No chapter</option>{subject?.chapters.map(item=><option key={item.id} value={item.id}>{item.number}. {item.title}</option>)}</select></label>{file.visibility==='shared'?<p>Updating a shared file sends it for moderation again.</p>:null}<button type="submit" disabled={busy||!name.trim()}>{busy?'Saving…':'Save changes'}</button></fieldset>{error?<p role="alert">{error}</p>:null}</form></details>;
}
