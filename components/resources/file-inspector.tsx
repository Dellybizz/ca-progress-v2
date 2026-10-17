'use client';
import {useCallback,useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {UtilitySurface} from './utility-surface';
import {Drawer} from '@/components/ui/overlay';
const subscribe=(callback:()=>void)=>{const media=window.matchMedia('(min-width: 1000px)');media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);};
const snapshot=()=>window.matchMedia('(min-width: 1000px)').matches;
/** Desktop utility panel is deliberately non-modal: no backdrop, body lock, or focus trap. */
export function FileInspector({open,onClose,children}:{open:boolean;onClose:()=>void;children:ReactNode}){
 useEffect(()=>{if(!open)return;window.dispatchEvent(new Event('resource-inspector-open'));const transfers=()=>onClose();window.addEventListener('resource-transfer-open',transfers);return()=>{window.dispatchEvent(new Event('resource-inspector-close'));window.removeEventListener('resource-transfer-open',transfers);};},[open,onClose]);
 const desktop=useSyncExternalStore(subscribe,snapshot,()=>false);
 // A surface may move into the shell after mounting; bind focus to the actual dock node.
 const focusPanel=useCallback((node:HTMLElement|null)=>{if(!node)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;node.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
 if(!desktop)return <Drawer open={open} onClose={onClose} title="File details">{children}</Drawer>;
 return open?<UtilitySurface><aside ref={focusPanel} className="fm-inspector" role="region" aria-label="File details" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}}}><header><h2>File details</h2><button type="button" aria-label="Close File details" onClick={onClose}>✕</button></header><div className="fm-inspector-body">{children}</div></aside></UtilitySurface>:null;
}
