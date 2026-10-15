'use client';
import {useEffect,useState} from 'react';
import Image from 'next/image';
import {Icon} from '@/components/ui/icon';
import type {ManagedFile} from '@/lib/resources/file-manager';
export function FileThumbnail({file,small=false}:{file:ManagedFile;small?:boolean}) {
  const [failed,setFailed]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{if(!failed||retry>=3)return;const timer=setTimeout(()=>{setRetry(value=>value+1);setFailed(false);},5000);return()=>clearTimeout(timer);},[failed,retry]);
  return <div className={`fm-thumbnail fm-thumbnail--${file.kind}${small?' fm-thumbnail--small':''}`}>
    {file.kind!=='note'&&file.previewUrl&&!failed ? <Image src={file.previewUrl+(file.previewUrl.includes('?')?'&':'?')+'attempt='+retry} alt="" fill unoptimized sizes={small?'42px':'260px'} loading="lazy" onError={()=>setFailed(true)}/> : file.kind==='note'&&!small ? <div className="fm-note-paper"><span>REVISION NOTE</span><strong>{file.name}</strong><p>{file.excerpt||'Open to read this note.'}</p></div> : <><div className="fm-file-glyph"><Icon name={file.kind==='link'?'shield':file.kind==='note'?'notes':'book'} size={small?20:34}/><b>{file.extension}</b></div>{!small&&<div className="fm-paper-lines"><i/><i/><i/></div>}</>}
    {file.processingState&&['queued','processing','failed','quarantined','unsupported'].includes(file.processingState)&&!small?<span className="fm-preview-unavailable">{file.processingState==='quarantined'?'File needs review':file.processingState==='failed'?'Preview needs retry':file.processingState==='unsupported'?'Preview unavailable':'Preparing preview…'}</span>:null}
    {failed&&!file.processingState&&!small?<span className="fm-preview-unavailable">Preview unavailable</span>:null}
  </div>;
}
