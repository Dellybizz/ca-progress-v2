import React, { useEffect, useState } from "react";
import { acceptServerConflict, readOpenConflicts, type LocalAccountRepository, type LocalConflict } from "../../../packages/mobile-data/src";

function readable(value:string){try{return JSON.stringify(JSON.parse(value),null,2);}catch{return value;}}

export function ConflictReview({repository,onClose}:{repository:LocalAccountRepository|null;onClose:()=>void}){
  const [items,setItems]=useState<LocalConflict[]>([]),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
  useEffect(()=>{if(!repository)return;let active=true;const read=()=>void readOpenConflicts(repository.accountId).then(next=>{if(active)setItems(next);}).catch(cause=>{if(active)setError(String(cause));});read();const unsubscribe=repository.subscribe(read);return()=>{active=false;unsubscribe();};},[repository]);
  const accept=async(item:LocalConflict,keepNote:boolean)=>{if(!repository)return;setBusy(item.id);setError("");try{
    if(keepNote){const local=(await repository.readWorkspace()).notes.find(note=>note.localId===item.localId);if(!local)throw new Error("Local note is unavailable; leave this conflict open.");await repository.saveNote({title:`${local.title} (local copy)`,body:local.body});}
    await acceptServerConflict(repository.accountId,item.id);window.dispatchEvent(new Event("ca-sync"));
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not resolve the conflict.");}finally{setBusy(null);}};
  return <div className="native-overlay" role="presentation" onClick={onClose}><section className="native-modal native-conflict-review" role="dialog" aria-modal="true" aria-label="Review sync conflicts" onClick={event=>event.stopPropagation()}><header><strong>Review saved edits</strong><button type="button" onClick={onClose} aria-label="Close conflict review">Close</button></header><p>These edits remain on this device until you choose how to proceed. Compare both versions before using the website version.</p>{error&&<p role="alert">{error}</p>}{items.length?items.map(item=><article key={item.id}><h2>{item.entityType.replaceAll("_"," ")}</h2><div className="native-conflict-versions"><section><strong>Your saved edit</strong><pre>{readable(item.localValue)}</pre></section><section><strong>Server response</strong><pre>{readable(item.serverValue)}</pre></section></div><div className="button-row">{item.entityType==="note"&&<button type="button" disabled={Boolean(busy)} onClick={()=>void accept(item,true)}>Keep local note copy and use server version</button>}<button type="button" disabled={Boolean(busy)} onClick={()=>void accept(item,false)}>Discard local edit and use server version</button></div></article>):<p>No unresolved conflicts.</p>}</section></div>;
}
