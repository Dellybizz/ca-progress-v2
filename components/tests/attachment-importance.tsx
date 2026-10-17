'use client';
import {useEffect,useState} from 'react';
export function AttachmentImportance({id}:{id:string}){
 const [important,setImportant]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/v1/tests/attachments/${encodeURIComponent(id)}/importance`,{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(result=>{if(!controller.signal.aborted)setImportant(Boolean(result.important));}).catch(()=>{if(!controller.signal.aborted)setError('Importance unavailable');});return()=>controller.abort();},[id]);
 async function toggle(){if(busy||important===null)return;setBusy(true);setError('');try{const response=await fetch(`/api/v1/tests/attachments/${encodeURIComponent(id)}/importance`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({important:!important})});if(!response.ok)throw new Error();const result=await response.json();setImportant(Boolean(result.important));}catch{setError('Could not update importance');}finally{setBusy(false);}}
 return <span><button className="ui-button ui-button--secondary" type="button" disabled={busy||important===null} aria-pressed={important===true} onClick={()=>void toggle()}>{busy?'Saving…':important?'Important ✓':'Mark important'}</button>{error?<span role="alert">{error}</span>:null}</span>;
}
