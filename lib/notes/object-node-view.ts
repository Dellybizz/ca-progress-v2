'use client';
import type {NodeViewRendererProps} from '@tiptap/core';
import {closeHistory} from '@tiptap/pm/history';
import {attachGraphEditing} from './graph-node-events';
import {renderDiagram} from './ca-formats';
/** DOM-only pointer previews; one history step and autosave on release. */
export function objectNodeView({node:initial,editor,getPos}:NodeViewRendererProps){
 let node=initial,selected=false,cleanup:(()=>void)|undefined;
 const imageNode=node.type.name==='image',dom=document.createElement(imageNode?'span':'figure');dom.className=(imageNode?'note-image':'note-diagram')+' note-object';dom.contentEditable='false';
 const graphic=document.createElement('div');graphic.className=imageNode?'note-object-image':'note-diagram-graphic';const title=document.createElement('figcaption'),caption=document.createElement('span');caption.className='note-image-caption';
 const edit=document.createElement('button');edit.type='button';edit.textContent=imageNode?'Edit image':'Edit chart';edit.className='note-object-edit';
 const select=()=>{const pos=getPos();if(typeof pos==='number')editor.commands.setNodeSelection(pos);};
 const open=()=>{select();editor.view.dom.dispatchEvent(new CustomEvent('ca-note-edit-node',{detail:imageNode?'image':'chart'}));};
 edit.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open();});
 dom.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();if(imageNode)open();else select();});
 dom.addEventListener('click',e=>{if(!(e.target as Element).closest('button')){e.preventDefault();select();}});
 const failure=document.createElement('button');failure.type='button';failure.className='note-image-error';failure.textContent='Image unavailable · Retry';failure.hidden=true;const img=document.createElement('img');img.loading='lazy';
 img.addEventListener('error',()=>{img.hidden=true;failure.hidden=false;dom.querySelectorAll<HTMLButtonElement>('.note-resize-handle').forEach(h=>h.disabled=true);});img.addEventListener('load',()=>{img.hidden=false;failure.hidden=true;dom.querySelectorAll<HTMLButtonElement>('.note-resize-handle').forEach(h=>h.disabled=false);});failure.onclick=()=>{img.src=node.attrs.src;};
 if(imageNode)graphic.append(img,failure);else dom.append(title);dom.append(graphic,caption,edit);
 const render=()=>{dom.style.width=(node.attrs.width??100)+'%';dom.style.marginLeft=['center','right'].includes(node.attrs.align)?'auto':'0';dom.style.marginRight=node.attrs.align==='right'?'0':'auto';graphic.style.height=node.attrs.height?node.attrs.height+'px':'';if(imageNode){if(img.getAttribute('src')!==node.attrs.src)img.src=node.attrs.src;img.alt=node.attrs.alt;img.title=node.attrs.title;img.style.objectFit=node.attrs.crop;caption.textContent=node.attrs.caption;}else{title.textContent=node.attrs.title;try{graphic.innerHTML=renderDiagram(node.attrs.kind,node.attrs.data,node.attrs.title,node.attrs.variant);}catch{graphic.textContent='Edit this chart to correct its data.';}}};
 render();
 const stopGraph=imageNode?undefined:attachGraphEditing({editor,getPos},graphic,()=>node);
 for(const corner of ['se','sw','ne','nw']){const handle=document.createElement('button');handle.type='button';handle.className='note-resize-handle is-'+corner;handle.setAttribute('aria-label','Resize '+(imageNode?'image':'chart')+' '+corner);handle.disabled=imageNode&&!img.naturalWidth;handle.title='Drag to resize · Shift to keep proportions';
  const commit=(width:number,height:number|null)=>{const pos=getPos();if(typeof pos!=='number')return;editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(pos,undefined,{...node.attrs,width,height}));};
  handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();commit(Math.max(10,Math.min(100,(node.attrs.width??100)+(e.key==='ArrowRight'?2:e.key==='ArrowLeft'?-2:0))),imageNode&&!node.attrs.height&&['ArrowLeft','ArrowRight'].includes(e.key)?null:Math.max(80,Math.min(1600,(node.attrs.height??graphic.offsetHeight)+(e.key==='ArrowDown'?10:e.key==='ArrowUp'?-10:0))));};
  handle.onpointerdown=e=>{if(e.button!==0||imageNode&&!img.naturalWidth)return;e.preventDefault();e.stopPropagation();select();cleanup?.();const rect=dom.getBoundingClientRect(),box=graphic.getBoundingClientRect(),scale=rect.width/dom.offsetWidth||1,parentWidth=rect.width/((node.attrs.width??100)/100),startX=e.clientX,startY=e.clientY,startWidth=node.attrs.width??100,ratio=box.height/rect.width;let moved=false,width=startWidth,height=node.attrs.height??Math.round(box.height/scale);
   const move=(event:PointerEvent)=>{moved ||= Math.abs(event.clientX-startX)+Math.abs(event.clientY-startY)>2;width=Math.round(Math.max(10,Math.min(100,startWidth+(event.clientX-startX)*(corner.includes('w')?-1:1)/parentWidth*100)));if(imageNode&&!node.attrs.height){height=null;}else if(event.shiftKey||imageNode){const factor=parentWidth*ratio/scale/100;width=Math.max(Math.min(100,Math.ceil(80/factor)),Math.min(Math.floor(1600/factor),width));height=Math.round(width*factor);}else height=Math.round(Math.max(80,Math.min(1600,(box.height+(event.clientY-startY)*(corner.includes('n')?-1:1))/scale)));dom.style.width=width+'%';graphic.style.height=height?height+'px':'';};
   const finish=(event:PointerEvent)=>{cleanup?.();if(event.type==='pointercancel')render();else if(moved&&(width!==startWidth||height!==node.attrs.height))commit(width,height);};
   cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);cleanup=undefined;};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
  };dom.append(handle);
 }
 return {dom,update(next:typeof node){if(next.type!==node.type)return false;node=next;render();return true;},selectNode(){selected=true;dom.classList.add('ProseMirror-selectednode');},deselectNode(){selected=false;dom.classList.remove('ProseMirror-selectednode');},stopEvent(event:Event){return !!(event.target as Element).closest('button,[data-node-id],[data-edge-id],[data-category-id]')||selected&&event.type==='dblclick';},ignoreMutation(){return true;},destroy(){cleanup?.();stopGraph?.();}};
}
