'use client';
import {useEffect,useEffectEvent,useRef,useState,type FormEvent} from 'react';
import type {ManagedFile} from '@/lib/resources/file-manager';
import type {NoteSubjectOption} from '@/lib/notes/types';
export function FileOrganization({file,subjects,onSaved,onDirtyChange,onBusyChange}:{file:ManagedFile;subjects:NoteSubjectOption[];onSaved:()=>void;onDirtyChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void}) {
  const pending=useRef(false);const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[name,setName]=useState(file.name),[subjectId,setSubjectId]=useState(file.subjectIds[0]||''),[chapterId,setChapterId]=useState(file.chapterId||'');
  const notifyUnmount=useEffectEvent(()=>onDirtyChange?.(false));
  useEffect(()=>()=>notifyUnmount(),[]);
  function edited(){setSaved(false);onDirtyChange?.(true);}
  const subject=subjects.find(item=>item.id===subjectId);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(pending.current)return;if(!navigator.onLine){setError('Connect to save these details. Your edits are retained.');return;}pending.current=true;setBusy(true);onBusyChange?.(true);setError('');setSaved(false);try{
    const response=await fetch(`/api/v1/resources/${encodeURIComponent(file.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:name.trim(),subjectId:subjectId||null,chapterId:chapterId||null,visibility:file.visibility})});
    const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||'Could not update this file.');setSaved(true);onDirtyChange?.(false);onSaved();
  }catch(caught){setError(caught instanceof Error?caught.message:'Could not update this file.');}finally{pending.current=false;setBusy(false);onBusyChange?.(false);}}
  return <details className="fm-organize"><summary>Edit name and academic tags</summary><form onSubmit={save}><fieldset disabled={busy}><label>Display name<input required maxLength={160} value={name} onChange={event=>{setName(event.target.value);edited();}}/></label><label>Subject<select aria-label="Subject" value={subjectId} onChange={event=>{setSubjectId(event.target.value);setChapterId('');edited();}}><option value="">Unfiled</option>{subjects.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Chapter<select aria-label="Chapter" disabled={busy||!subject} value={chapterId} onChange={event=>{setChapterId(event.target.value);edited();}}><option value="">No chapter</option>{subject?.chapters.map(item=><option key={item.id} value={item.id}>{item.number}. {item.title}</option>)}</select></label>{file.visibility==='shared'?<p>Updating a shared file sends it for moderation again.</p>:null}<button type="submit" disabled={busy||!name.trim()}>{busy?'Saving…':'Save changes'}</button></fieldset>{saved?<p role="status">Changes saved. The file list has been refreshed.</p>:null}{error?<p role="alert">{error}</p>:null}</form></details>;
}
