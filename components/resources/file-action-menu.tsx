'use client';
import {useEffect,useLayoutEffect,useRef,Fragment,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
export type FileAction={id:string;label:string;disabled?:boolean;reason?:string;danger?:boolean;shortcut?:'Enter'|'F2'|'Delete';execute:()=>void};
const actionGroup=(id:string)=>['open','details','restore'].includes(id)?0:['rename','duplicate','replace-version'].includes(id)?1:['move','tag','star','share'].includes(id)?2:id==='export'?3:4;
const actionPaths:Record<string,string>={share:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M20 7v6M17 10h6',open:'M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',details:'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',rename:'m15 4 5 5M4 15 15 4a3.5 3.5 0 0 1 5 5L9 20l-6 1 1-6Z',duplicate:'M9 9h12v12H9zM15 9V3H3v12h6','replace-version':'M4 8h14l-4-4M20 16H6l4 4M4 8v5M20 16v-5',move:'M3 7V4h6l3 3h9v13H3V7Zm5 7h8m-3-3 3 3-3 3',tag:'M3 3h8l10 10-8 8L3 11V3Zm4 4h.01',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',export:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',restore:'M3 9a9 9 0 1 1 1 9M3 3v6h6',erase:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10l4 7M14 10l-4 7'};
export function FileActionGlyph({action}:{action:string}){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={actionPaths[action]??actionPaths.details}/></svg>;}
export function FileActionMenu({id,actions:items,x,y,anchor,onClose,label='File actions'}:{anchor:HTMLElement;id:string;label?:string;actions:FileAction[];x:number;y:number;onClose:(restoreFocus:boolean)=>void}){
 const actions=[...items].sort((a,b)=>actionGroup(a.id)-actionGroup(b.id));
 const menu=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const node=menu.current;if(!node)return;
  node.style.maxHeight=`${window.innerHeight-24}px`;
  const bounds=node.getBoundingClientRect(),trigger=anchor.getBoundingClientRect();
  const left=Math.max(8,Math.min(x,window.innerWidth-bounds.width-8));
  let top=Math.max(8,Math.min(y,window.innerHeight-bounds.height-8));
  const overlaps=left<trigger.right&&left+bounds.width>trigger.left&&top<trigger.bottom&&top+bounds.height>trigger.top;
  if(overlaps){
   const above=Math.max(0,trigger.top-12),below=Math.max(0,window.innerHeight-trigger.bottom-12);
   if(below>=bounds.height)top=trigger.bottom+4;
   else if(above>=bounds.height)top=trigger.top-bounds.height-4;
   else if(above>=below){node.style.maxHeight=`${Math.max(40,above)}px`;top=8;}
   else{node.style.maxHeight=`${Math.max(40,below)}px`;top=trigger.bottom+4;}
  }
  node.style.left=`${left}px`;node.style.top=`${top}px`;
 },[x,y,actions,anchor]);
 useLayoutEffect(()=>{menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});},[id]);
 useLayoutEffect(()=>{const escape=(event:globalThis.KeyboardEvent)=>{if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();onClose(true);};document.addEventListener('keydown',escape,true);return()=>document.removeEventListener('keydown',escape,true);},[onClose]);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&(event.target as Element).closest?.('[aria-controls]')?.getAttribute('aria-controls')!==id)onClose(false);};
  const close=(event:Event)=>{if(event.target instanceof Node&&menu.current?.contains(event.target))return;onClose(false);};
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',close);document.addEventListener('wheel',close,{passive:true});document.addEventListener('touchmove',close,{passive:true});
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',close);document.removeEventListener('wheel',close);document.removeEventListener('touchmove',close);};
 },[onClose,id]);
 function keyboard(event:KeyboardEvent){
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();onClose(true);return;}
  if(event.key==='Tab'){onClose(true);return;}
  const shortcut=actions.find(action=>action.shortcut===event.key&&!action.disabled);if(shortcut&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key!=='Enter'){event.preventDefault();onClose(true);shortcut.execute();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
 }
 return createPortal(<div id={id} ref={menu} role="menu" aria-label={label} className="fm-action-menu" style={{left:Math.max(8,Math.min(x,window.innerWidth-272)),top:Math.max(8,Math.min(y,window.innerHeight-Math.min(actions.length*40+16,window.innerHeight-24)))}} onKeyDown={keyboard}>{actions.map((action,index)=><Fragment key={action.id}>{index>0&&actionGroup(actions[index-1].id)!==actionGroup(action.id)?<div role="separator" className="fm-menu-separator"/>:null}<button role="menuitem" type="button" disabled={action.disabled} title={action.reason} aria-keyshortcuts={action.shortcut} className={action.danger?'is-danger':undefined} onClick={()=>{onClose(true);action.execute();}}><FileActionGlyph action={action.id}/><span className="fm-menu-label">{action.label}{action.disabled&&action.reason?<small>{action.reason}</small>:null}</span>{action.shortcut?<kbd aria-hidden="true">{action.shortcut==='Delete'?'Del':action.shortcut}</kbd>:null}</button></Fragment>)}</div>,document.body);
}
