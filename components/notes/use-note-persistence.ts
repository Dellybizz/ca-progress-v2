'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {invalidateWorkspacePages} from '@/lib/resources/workspace-page-cache';
import {getOfflineMeta,putOfflineMeta,getOfflineMutationResult} from '@/lib/offline/database';
import {offlineMutationFetch} from '@/lib/offline/mutation';
import {HIERARCHY_EDITOR_CAPABILITY,ACCOUNTING_EDITOR_CAPABILITY,WORKING_NOTES_CAPABILITY} from '@/lib/notes/hierarchy-compatibility';
import type {StructuredNote} from '@/lib/notes/structured-document';
export type NoteSnapshot={title:string;document:StructuredNote;subjectId:string|null;chapterId:string|null;topicId:string|null;tags:string[];visibility:'private'|'shared';resourceIds:string[];sourceMessageId:string|null};
export type NoteDraft={format:2;ownerId:string;contextKey:string;updatedAt:string;savedId:string|null;serverRevision:number|undefined;snapshot:NoteSnapshot;version:number;cloudVersion:number;baseline?:Record<string,unknown>|null;queuedReceipt?:string|null};
type Options={ownerId:string|null|undefined;contextKey:string;draftId:string;noteId?:string;revision?:number;baseline?:Record<string,unknown>|null;enabled:boolean;snapshot:()=>NoteSnapshot;onDirtyChange?:(value:boolean)=>void;onSaved?:()=>void};
export function useNotePersistence(options:Options){
 const latest=useRef(options);useLayoutEffect(()=>{latest.current=options;});
 const identity=useRef({owner:options.ownerId,context:options.contextKey}),id=useRef(options.noteId??null),revision=useRef(options.revision),version=useRef(0),cloudVersion=useRef(0),localVersion=useRef(0),writing=useRef(Promise.resolve()),saving=useRef<Promise<boolean>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true),conflicted=useRef(false);
 const draftTimer=useRef<ReturnType<typeof setTimeout>|null>(null),draftDeadline=useRef<ReturnType<typeof setTimeout>|null>(null);
 const baseline=useRef(options.baseline??null),queuedReceipt=useRef<string|null>(null);
 const [status,setStatus]=useState<'ready'|'editing'|'saved'|'device'|'saving'|'error'>('ready'),[error,setError]=useState(''),[recovery,setRecovery]=useState<NoteDraft|null>(null),[savedId,setSavedId]=useState(options.noteId??null);
 const key=`typed-note-draft:${options.contextKey}:${options.draftId}`;
 const sameIdentity=()=>latest.current.ownerId===identity.current.owner&&latest.current.contextKey===identity.current.context;
 const persist=()=>{
  if(draftTimer.current){clearTimeout(draftTimer.current);draftTimer.current=null;}
  if(draftDeadline.current){clearTimeout(draftDeadline.current);draftDeadline.current=null;}
  if(!sameIdentity()||!latest.current.ownerId)return Promise.reject(Error('Your account or study profile changed. Reopen the note before saving.'));
  const captured=version.current,owner=latest.current.ownerId;
  const draft:NoteDraft={format:2,ownerId:owner,contextKey:latest.current.contextKey,updatedAt:new Date().toISOString(),savedId:id.current,serverRevision:revision.current,snapshot:latest.current.snapshot(),version:captured,cloudVersion:cloudVersion.current,baseline:baseline.current,queuedReceipt:queuedReceipt.current};
  writing.current=writing.current.catch(()=>undefined).then(async()=>{await putOfflineMeta(owner,key,draft);localVersion.current=Math.max(localVersion.current,captured);});
  return writing.current;
 };
 const save=async(manual=false):Promise<boolean>=>{
  if(saving.current){await saving.current;if(version.current!==cloudVersion.current)return save(manual);if(manual)latest.current.onSaved?.();return true;}
  if(!latest.current.enabled||!sameIdentity())return false;
  if(conflicted.current){setError('A newer saved note exists. Your device draft is safe. Reopen the saved note before continuing.');return false;}
  if(!version.current||version.current===cloudVersion.current){if(manual)latest.current.onSaved?.();return true;}
  const work=(async()=>{
   const captured=version.current,snapshot=latest.current.snapshot();
   try{
    await persist();if(!sameIdentity())return false;
    if(manual&&mounted.current)setStatus('saving');
    if(queuedReceipt.current){const receipt=await getOfflineMutationResult(latest.current.ownerId!,queuedReceipt.current);if(receipt?.data._offlineBaseline){baseline.current=receipt.data._offlineBaseline as Record<string,unknown>;queuedReceipt.current=null;}}
    const result=await offlineMutationFetch(latest.current.ownerId!,'/api/v1/notes',{...snapshot,editorCapabilities:[HIERARCHY_EDITOR_CAPABILITY,ACCOUNTING_EDITOR_CAPABILITY,WORKING_NOTES_CAPABILITY],bodyHtml:'',id:id.current,clientId:options.draftId,expectedRevision:revision.current,expectedOwnerId:identity.current.owner,expectedContextKey:identity.current.context},{},baseline.current);
    const payload=await result.response.json() as {id?:string;noteRevision?:number;error?:string;code?:string;_offlineBaseline?:Record<string,unknown>};
    if(!sameIdentity())return false;
    if(result.response.status===409&&payload.id&&!id.current){id.current=payload.id;revision.current=payload.noteRevision;await persist();throw Error('The earlier draft was saved. Press Save to include your latest changes.');}
    if(!result.response.ok||!payload.id){if(payload.code==='NOTE_REVISION_CONFLICT'||payload.code==='NOTE_EDITOR_REQUIRED')conflicted.current=true;throw Error(payload.error??'The note could not be saved.');}
    id.current=payload.id;if(typeof payload.noteRevision==='number')revision.current=payload.noteRevision;
    if(payload._offlineBaseline)baseline.current=payload._offlineBaseline;
    queuedReceipt.current=result.queued?result.idempotencyKey:null;
    cloudVersion.current=captured;
    invalidateWorkspacePages(JSON.stringify([identity.current.owner??'guest',identity.current.context]));
    // A later edit stays in the draft, even if it arrived during this request.
    await persist();
    if(mounted.current){setSavedId(payload.id);setError('');setStatus(version.current===captured?(result.queued?'device':'saved'):'editing');}
    latest.current.onDirtyChange?.(version.current!==captured);
    if(manual&&version.current===captured)latest.current.onSaved?.();
    return true;
   }catch(caught){if(mounted.current&&sameIdentity()){setError(caught instanceof Error?caught.message:'The note could not be saved. Your draft is retained.');setStatus('error');}return false;}
  })();
  saving.current=work;const ok=await work;saving.current=null;
  if(ok&&version.current!==cloudVersion.current&&!conflicted.current){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void save(),1000);}
  return ok;
 };
 const changed=()=>{
  version.current++;latest.current.onDirtyChange?.(true);setStatus('editing');
  if(draftTimer.current)clearTimeout(draftTimer.current);
  const writeDraft=()=>void persist().catch(caught=>{if(mounted.current){setError(caught instanceof Error?caught.message:'Device draft storage is unavailable. Keep this note open.');setStatus('error');}});
  draftTimer.current=setTimeout(writeDraft,150);
  if(!draftDeadline.current)draftDeadline.current=setTimeout(writeDraft,1000);
  if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void save(),1800);
 };
 useEffect(()=>{
  mounted.current=true;let active=true;
  if(options.ownerId)getOfflineMeta<NoteDraft>(options.ownerId,key).then(draft=>{if(active&&draft?.format===2&&draft.ownerId===options.ownerId&&draft.contextKey===options.contextKey&&(draft.version>draft.cloudVersion||draft.queuedReceipt||!options.noteId))setRecovery(draft);}).catch(()=>{if(active)setError('Device draft recovery is unavailable. Keep this note open until saved.');});
  const guard=(event:BeforeUnloadEvent)=>{if(version.current>localVersion.current){event.preventDefault();event.returnValue='';}};
  const flushDraft=()=>{if(version.current>localVersion.current)void persist().catch(()=>undefined);};
  const hidden=()=>{if(document.visibilityState==='hidden')flushDraft();};
  const online=()=>{if(version.current!==cloudVersion.current)void save();};
  window.addEventListener('pagehide',flushDraft);document.addEventListener('visibilitychange',hidden);
  window.addEventListener('beforeunload',guard);window.addEventListener('online',online);
  return()=>{flushDraft();if(draftTimer.current)clearTimeout(draftTimer.current);if(draftDeadline.current)clearTimeout(draftDeadline.current);window.removeEventListener('pagehide',flushDraft);document.removeEventListener('visibilitychange',hidden);active=false;mounted.current=false;if(timer.current)clearTimeout(timer.current);window.removeEventListener('beforeunload',guard);window.removeEventListener('online',online);};
 // Draft identity is fixed for the lifetime of an editor instance.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,options.ownerId,options.contextKey]);
 const acceptRecovery=(draft:NoteDraft)=>{id.current=draft.savedId;revision.current=draft.serverRevision;baseline.current=draft.baseline??null;queuedReceipt.current=draft.queuedReceipt??null;version.current=Math.max(version.current,draft.version);cloudVersion.current=draft.cloudVersion;setRecovery(null);setSavedId(draft.savedId);conflicted.current=false;changed();};
 return {changed,save,status,error,recovery,acceptRecovery,dismissRecovery:()=>setRecovery(null),savedId,hasChanges:()=>version.current>0};
}
