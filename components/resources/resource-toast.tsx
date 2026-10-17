'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
type Notice={scope:string;message:string;danger:boolean};
export function resourceConfirmation(scope:string,message:string,danger=false){window.dispatchEvent(new CustomEvent<Notice>('ca-resource-confirmation',{detail:{scope,message,danger}}));}
export function ResourceToast({scope}:{scope:string}){
 const [notice,setNotice]=useState<Notice|null>(null);
 useEffect(()=>{let timer=0;const receive=(event:Event)=>{const next=(event as CustomEvent<Notice>).detail;if(next.scope!==scope)return;clearTimeout(timer);setNotice(next);timer=window.setTimeout(()=>setNotice(null),next.danger?6500:3500);};window.addEventListener('ca-resource-confirmation',receive);return()=>{clearTimeout(timer);window.removeEventListener('ca-resource-confirmation',receive);};},[scope]);
 return notice?createPortal(<div className="fm-resource-toast" data-tone={notice.danger?'error':'success'} role={notice.danger?'alert':'status'} aria-atomic="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={notice.danger?'M12 8v5M12 16h.01M12 3 2 21h20L12 3Z':'m5 12 4 4L19 6'}/></svg><span>{notice.message}</span></div>,document.body):null;
}
