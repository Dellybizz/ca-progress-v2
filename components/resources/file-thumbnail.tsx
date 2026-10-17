'use client';
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {Icon} from '@/components/ui/icon';
import {repairImageThumbnail} from '@/lib/resources/thumbnail-repair';
import {useStudentContext} from '@/components/academic/student-context-provider';
import {cachedPreview,loadPreview,previewMemoryKey} from '@/lib/resources/preview-memory';
import type {ManagedFile} from '@/lib/resources/file-manager';
export function FileThumbnail({file,small=false}:{file:ManagedFile;small?:boolean}) {
 return <Thumbnail key={`${file.key}:${file.previewRevision??file.modified}:${file.processingState??""}`} file={file} small={small}/>;
}
function Thumbnail({file,small=false}:{file:ManagedFile;small?:boolean}) {
 const student=useStudentContext(true);const box=useRef<HTMLDivElement>(null);
 const preview=file.previewUrl?file.previewUrl+(file.previewUrl.includes('?')?'&':'?')+'v='+encodeURIComponent((file.previewRevision??file.modified)+':'+(file.processingState??'')):'';
 const memoryKey=previewMemoryKey(JSON.stringify([student?.userId,student?.contextKey]),preview);
 const staticPreview=preview.startsWith('/resources-preview/');
 const [source,setSource]=useState<string|undefined>(()=>staticPreview?preview:cachedPreview(memoryKey));
 const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(Boolean(source)),[retry,setRetry]=useState(0);const repaired=useRef(false);
 const blocked=['failed','quarantined','unsupported'].includes(file.processingState??'');
 useEffect(()=>{if(!failed||blocked||retry>=3)return;const timer=setTimeout(()=>{setRetry(value=>value+1);setFailed(false);},5000);return()=>clearTimeout(timer);},[failed,retry,blocked]);
 useEffect(()=>{const node=box.current;if(!node||!preview||blocked||staticPreview)return;let cancelled=false;
  const load=()=>{void loadPreview(memoryKey,preview+(retry?'&attempt='+retry:'')).then(value=>{if(!cancelled){setSource(value);setFailed(false);}}).catch(()=>{if(!cancelled)setFailed(true);});};
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}},{rootMargin:'240px'});observer.observe(node);return()=>{cancelled=true;observer.disconnect();};
 },[preview,memoryKey,blocked,retry,staticPreview]);
 const visual=file.kind!=='note'&&source&&!failed&&!blocked;
 const message=loaded?'':file.processingState==='quarantined'?'File needs review':file.processingState==='failed'?'Preview needs retry':file.processingState==='unsupported'?'No preview available':retry>=3?'Preview not ready':['queued','processing'].includes(file.processingState??'')?'Preparing preview…':failed?'Preview unavailable':'';
 return <div ref={box} className={`fm-thumbnail fm-thumbnail--${file.kind}${small?' fm-thumbnail--small':''}${loaded?' has-preview':''}`}>
  {visual?<Image src={source!} alt="" fill unoptimized sizes={small?'42px':'768px'} loading="eager" decoding="async" onLoad={event=>{setLoaded(true);if(file.kind==='image'&&file.canManage&&file.thumbnailMissing!==false&&!repaired.current){repaired.current=true;const image=event.currentTarget;repairImageThumbnail(image,file.previewUrl!,()=>{void loadPreview(memoryKey,preview+'&quality=high',true).then(value=>{if(image.isConnected)setSource(value);}).catch(()=>undefined);},memoryKey);}}} onError={()=>{setLoaded(false);setFailed(true);}}/>:file.kind==='note'&&!small?<div className="fm-note-paper"><span>REVISION NOTE</span><strong>{file.name}</strong><p>{file.excerpt||'Open to read this note.'}</p></div>:<><div className="fm-file-glyph">{file.kind==='image'?<svg width={small?22:42} height={small?22:42} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="5" width="32" height="30" rx="5"/><circle cx="14" cy="15" r="3"/><path d="m5 29 9-8 7 6 5-5 9 8"/></svg>:<Icon name={file.kind==='link'?'shield':'notes'} size={small?20:34}/>}<b>{file.extension}</b></div></>}
  {message&&!small?<span className="fm-preview-unavailable">{message}</span>:null}
 </div>;
}
