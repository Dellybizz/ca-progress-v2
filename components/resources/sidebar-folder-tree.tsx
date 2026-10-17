'use client';
import {useEffect,useState,type HTMLAttributes} from 'react';
import {createPortal} from 'react-dom';
export type SidebarFolder={id:string;name:string;parent_id:string|null};
export function SidebarFolderTree({folders,current,onOpen,onWarm,dropProps}:{folders:SidebarFolder[];current:string;onOpen:(id:string)=>void;onWarm?:(id:string)=>void;dropProps?:(id:string)=>(HTMLAttributes<HTMLButtonElement>&{'data-folder-target'?:string;'data-drop-state'?:string})}){
 const [host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{const timer=window.setTimeout(()=>setHost(document.getElementById('fm-view-navigation')),0);return()=>clearTimeout(timer);},[]);
 const ids=new Map(folders.map(item=>[item.id,item])),expanded=new Set<string>();let at=current;
 while(at&&!expanded.has(at)){expanded.add(at);at=ids.get(at)?.parent_id??'';}
 const children=new Map<string,SidebarFolder[]>();for(const item of folders){const parent=item.parent_id&&ids.has(item.parent_id)?item.parent_id:'';children.set(parent,[...(children.get(parent)??[]),item]);}
 const branch=(parent:string,depth=0):React.ReactNode=>depth>20?null:<ul>{(children.get(parent)??[]).map(item=>{const hasChildren=Boolean(children.get(item.id)?.length),open=expanded.has(item.id);return <li key={item.id}><button type="button" {...dropProps?.(item.id)} aria-current={current===item.id?'page':undefined} aria-expanded={hasChildren?open:undefined} onClick={()=>onOpen(item.id)} onPointerEnter={()=>onWarm?.(item.id)} onFocus={()=>onWarm?.(item.id)} style={{paddingInlineStart:8+depth*12}} title={item.name}><svg className="fm-tree-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{visibility:hasChildren?'visible':'hidden',transform:open?'rotate(90deg)':undefined}}><path d="m6 3 5 5-5 5"/></svg><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 7V5h7l2 3h9v12H3V7Z"/></svg><span>{item.name}</span></button>{hasChildren&&open?branch(item.id,depth+1):null}</li>;})}</ul>;
 return host&&folders.length?createPortal(<nav className="fm-sidebar-folders fm-sidebar-tree" aria-label="Folders"><span>Folders</span>{branch('')}</nav>,host):null;
}
