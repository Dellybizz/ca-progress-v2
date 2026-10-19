'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {Editor} from '@tiptap/react';
import {NodeSelection} from '@tiptap/pm/state';
/** Selection stays in the document while the contextual tools receive focus. */
export function NoteContextMenu({editor,children,edit,actions}:{editor:Editor;children:ReactNode;edit:()=>void;actions?:ReactNode}){
 const ref=useRef<HTMLElement>(null),[position,setPosition]=useState<{x:number;y:number}|null>(null);
 useEffect(()=>{
  const studio=editor.view.dom.closest<HTMLElement>('.note-studio');if(!studio)return;
  let timer:ReturnType<typeof setTimeout>|undefined,start:{x:number;y:number;id:number}|undefined,held=false;
  const clear=()=>{clearTimeout(timer);timer=undefined;};
  const close=()=>{clear();setPosition(null);studio.removeAttribute('data-context-open');};
  const show=(x:number,y:number)=>{if(!editor.isEditable)return;const at=editor.view.posAtCoords({left:x,top:y});if(at){const resolved=editor.state.doc.resolve(at.pos);if(resolved.depth){const pos=resolved.before(1),node=editor.state.doc.nodeAt(pos);if(node&&['table','account'].includes(node.type.name))editor.commands.setTextSelection(at.pos);else if(node&&!node.isTextblock)editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc,pos)));}}studio.setAttribute('data-context-open','');setPosition({x:Math.min(x,Math.max(8,innerWidth-370)),y:Math.min(y,Math.max(8,innerHeight-Math.min(480,innerHeight*.6)-8))});window.dispatchEvent(new Event('resize'));};
  const context=(e:MouseEvent)=>{if(!(e.target instanceof Element)||!e.target.closest('.note-scroll-canvas'))return;e.preventDefault();show(e.clientX,e.clientY);};
  const down=(e:PointerEvent)=>{if(!(e.target instanceof Element))return;if(!e.target.closest('.note-editing-dock'))close();if(e.pointerType!=='touch'||!e.target.closest('.note-document')||e.target.closest('button,input,textarea,[data-resize],.note-diagram-graphic [data-node-id]'))return;if(start){clear();start=undefined;return;}held=false;start={x:e.clientX,y:e.clientY,id:e.pointerId};timer=setTimeout(()=>{held=true;show(e.clientX,e.clientY);},500);};
  const move=(e:PointerEvent)=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)clear();};
  const end=()=>{clear();start=undefined;};
  const click=(e:MouseEvent)=>{if(held){held=false;e.preventDefault();e.stopPropagation();}};
  const key=(e:KeyboardEvent)=>{if((e.shiftKey&&e.key==='F10'||e.key==='ContextMenu')&&studio.contains(document.activeElement)){e.preventDefault();const point=editor.view.coordsAtPos(editor.state.selection.from);show(point.left,point.bottom);}if(e.key==='Escape'){close();editor.view.focus();}};
  studio.addEventListener('contextmenu',context);document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',end,true);document.addEventListener('pointercancel',end,true);studio.addEventListener('click',click,true);document.addEventListener('keydown',key);
  return()=>{close();studio.removeEventListener('contextmenu',context);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',end,true);document.removeEventListener('pointercancel',end,true);studio.removeEventListener('click',click,true);document.removeEventListener('keydown',key);};
 },[editor]);
 useEffect(()=>{if(position)ref.current?.focus();},[position]);
 return <section ref={ref} tabIndex={-1} className="note-editing-dock" role="dialog" aria-label="Selected content options" hidden={!position} style={position?{left:position.x,top:position.y}:undefined}>
 <header><strong>Selected content</strong><button type="button" aria-label="Close content options" onClick={()=>{setPosition(null);editor.view.dom.closest('.note-studio')?.removeAttribute('data-context-open');}}>×</button></header>
 <div className="note-context-actions"><button type="button" onClick={()=>{setPosition(null);editor.view.dom.closest('.note-studio')?.removeAttribute('data-context-open');edit();}}>Edit format</button><button type="button" disabled={!editor.can().undo()} onClick={()=>editor.commands.undo()}>Undo</button><button type="button" disabled={!editor.can().redo()} onClick={()=>editor.commands.redo()}>Redo</button></div>
 {actions}<details><summary>Position and size</summary><div data-context-layout/></details><details><summary>Appearance and content</summary><div data-context-content>{children}</div></details>
 </section>;
}
