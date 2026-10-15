'use client';
import {useEffect,useLayoutEffect,useRef,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
export type FileAction={id:string;label:string;disabled?:boolean;reason?:string;danger?:boolean;execute:()=>void};
export function FileActionMenu({id,actions,x,y,anchor,onClose}:{anchor:HTMLElement;id:string;actions:FileAction[];x:number;y:number;onClose:(restoreFocus:boolean)=>void}){
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
 useEffect(()=>{
  menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&(event.target as Element).closest?.('[aria-controls]')?.getAttribute('aria-controls')!==id)onClose(false);};
  const close=(event:Event)=>{if(event.target instanceof Node&&menu.current?.contains(event.target))return;onClose(false);};
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',close);document.addEventListener('wheel',close,{passive:true});document.addEventListener('touchmove',close,{passive:true});
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',close);document.removeEventListener('wheel',close);document.removeEventListener('touchmove',close);};
 },[onClose,id]);
 function keyboard(event:KeyboardEvent){
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();onClose(true);return;}
  if(event.key==='Tab'){onClose(true);return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
 }
 return createPortal(<div id={id} ref={menu} role="menu" aria-label="File actions" className="fm-action-menu" style={{left:Math.max(8,Math.min(x,window.innerWidth-272)),top:Math.max(8,Math.min(y,window.innerHeight-Math.min(actions.length*40+16,window.innerHeight-24)))}} onKeyDown={keyboard}>{actions.map(action=><button role="menuitem" type="button" key={action.id} disabled={action.disabled} title={action.reason} className={action.danger?'is-danger':undefined} onClick={()=>{onClose(true);action.execute();}}>{action.label}{action.disabled&&action.reason?<small>{action.reason}</small>:null}</button>)}</div>,document.body);
}
