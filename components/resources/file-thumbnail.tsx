'use client';
import {useState} from 'react';
import Image from 'next/image';
import {Icon} from '@/components/ui/icon';
import type {ManagedFile} from '@/lib/resources/file-manager';
export function FileThumbnail({file,small=false}:{file:ManagedFile;small?:boolean}) {
  const [failed,setFailed]=useState(false);
  return <div className={`fm-thumbnail fm-thumbnail--${file.kind}${small?' fm-thumbnail--small':''}`}>
    {file.kind==='image'&&file.previewUrl&&!failed ? <Image src={file.previewUrl} alt="" fill unoptimized sizes={small?'42px':'260px'} loading="lazy" onError={()=>setFailed(true)}/> : file.kind==='note'&&!small ? <div className="fm-note-paper"><span>REVISION NOTE</span><strong>{file.name}</strong><p>{file.excerpt||'Open to read this note.'}</p></div> : <><div className="fm-file-glyph"><Icon name={file.kind==='link'?'shield':file.kind==='note'?'notes':'book'} size={small?20:34}/><b>{file.extension}</b></div>{!small&&<div className="fm-paper-lines"><i/><i/><i/></div>}</>}
    {failed&&!small?<span className="fm-preview-unavailable">Preview unavailable</span>:null}
  </div>;
}
