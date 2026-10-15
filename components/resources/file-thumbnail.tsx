'use client';
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {Icon} from '@/components/ui/icon';
import {repairImageThumbnail} from '@/lib/resources/thumbnail-repair';
import type {ManagedFile} from '@/lib/resources/file-manager';
export function FileThumbnail({file,small=false}:{file:ManagedFile;small?:boolean}) {
 return <Thumbnail key={`${file.key}:${file.modified}:${file.processingState??""}`} file={file} small={small}/>;
}
function Thumbnail({file,small=false}:{file:ManagedFile;small?:boolean}) {
 const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[retry,setRetry]=useState(0);const repaired=useRef(false);
 const blocked=['failed','quarantined','unsupported'].includes(file.processingState??'');
 useEffect(()=>{if(!failed||blocked||retry>=3)return;const timer=setTimeout(()=>{setRetry(value=>value+1);setFailed(false);},5000);return()=>clearTimeout(timer);},[failed,retry,blocked]);
 const visual=file.kind!=='note'&&file.previewUrl&&!failed&&!blocked;
 const message=loaded?'':file.processingState==='quarantined'?'File needs review':file.processingState==='failed'?'Preview needs retry':file.processingState==='unsupported'?'No preview available':retry>=3?'Preview not ready':['queued','processing'].includes(file.processingState??'')?'Preparing preview…':failed?'Preview unavailable':'';
 return <div className={`fm-thumbnail fm-thumbnail--${file.kind}${small?' fm-thumbnail--small':''}${loaded?' has-preview':''}`}>
  {visual?<Image src={file.previewUrl!+(file.previewUrl!.includes('?')?'&':'?')+'v='+encodeURIComponent(file.modified+':'+(file.processingState??''))+'&attempt='+retry} alt="" fill unoptimized sizes={small?'42px':'320px'} loading="lazy" onLoad={event=>{setLoaded(true);if(file.kind==='image'&&file.canManage&&file.thumbnailMissing!==false&&!repaired.current){repaired.current=true;repairImageThumbnail(event.currentTarget,file.previewUrl!);}}} onError={()=>{setLoaded(false);setFailed(true);}}/>:file.kind==='note'&&!small?<div className="fm-note-paper"><span>REVISION NOTE</span><strong>{file.name}</strong><p>{file.excerpt||'Open to read this note.'}</p></div>:<><div className="fm-file-glyph">{file.kind==='image'?<svg width={small?22:42} height={small?22:42} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="5" width="32" height="30" rx="5"/><circle cx="14" cy="15" r="3"/><path d="m5 29 9-8 7 6 5-5 9 8"/></svg>:<Icon name={file.kind==='link'?'shield':'notes'} size={small?20:34}/>}<b>{file.extension}</b></div>{!small&&file.kind!=='image'?<div className="fm-paper-lines"><i/><i/><i/></div>:null}</>}
  {message&&!small?<span className="fm-preview-unavailable">{message}</span>:null}
 </div>;
}
