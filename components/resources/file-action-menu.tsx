'use client';
import {useEffect,useLayoutEffect,useRef,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
export type FileAction={id:string;label:string;disabled?:boolean;reason?:string;danger?:boolean;execute:()=>void};
export function FileActionMenu({id,actions,x,y,onClose}:{id:string;actions:FileAction[];x:number;y:number;onClose:(restoreFocus:boolean)=>void}){
 const menu=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const node=menu.current;if(node)node.style.top=`${Math.max(8,Math.min(y,window.innerHeight-node.getBoundingClientRect().height-8))}px`;},[x,y,actions]);
 useEffect(()=>{
  menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&(event.target as Element).closest?.('[aria-controls]')?.getAttribute('aria-controls')!==id)onClose(false);};
  const close=(event:Event)=>{if(event.type==='scroll'&&menu.current?.contains(event.target as Node))return;onClose(false);};
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};
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
