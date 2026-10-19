'use client';
import type {NodeViewRendererProps} from '@tiptap/core';
import {attachGraphEditing} from './graph-node-events';
import {renderDiagram} from './ca-formats';
/** DOM-only pointer previews; one history step and autosave on release. */
export function objectNodeView({node:initial,editor,getPos}:NodeViewRendererProps){
 let node=initial,selected=false;
 const imageNode=node.type.name==='image',dom=document.createElement(imageNode?'span':'figure');dom.className=(imageNode?'note-image':'note-diagram')+' note-object';dom.contentEditable='false';
 const graphic=document.createElement('div');graphic.className=imageNode?'note-object-image':'note-diagram-graphic';const title=document.createElement('figcaption'),caption=document.createElement('span');caption.className='note-image-caption';
 const edit=document.createElement('button');edit.type='button';edit.textContent=imageNode?'Edit image':'Edit chart';edit.className='note-object-edit';
 const select=()=>{const pos=getPos();if(typeof pos==='number')editor.commands.setNodeSelection(pos);};
 const open=()=>{if(!editor.isEditable)return;select();editor.view.dom.dispatchEvent(new CustomEvent('ca-note-edit-node',{detail:imageNode?'image':'chart'}));};
 edit.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open();});
 dom.addEventListener('dblclick',e=>{if((e.target as Element).closest('.note-graph-ui'))return;e.preventDefault();e.stopPropagation();if(imageNode)open();else select();});
 dom.addEventListener('click',e=>{if(!(e.target as Element).closest('button,.note-graph-ui')){e.preventDefault();select();}});
 const failure=document.createElement('button');failure.type='button';failure.className='note-image-error';failure.textContent='Image unavailable · Retry';failure.hidden=true;const img=document.createElement('img');img.loading='lazy';
 img.addEventListener('error',()=>{img.hidden=true;failure.hidden=false;dom.querySelectorAll<HTMLButtonElement>('.note-resize-handle').forEach(h=>h.disabled=true);});img.addEventListener('load',()=>{img.hidden=false;failure.hidden=true;dom.querySelectorAll<HTMLButtonElement>('.note-resize-handle').forEach(h=>h.disabled=false);});failure.onclick=()=>{img.src=node.attrs.src;};
 if(imageNode)graphic.append(img,failure);else dom.append(title);dom.append(graphic,caption,edit);
 const render=()=>{dom.style.width=(node.attrs.width??100)+'%';dom.style.marginLeft=['center','right'].includes(node.attrs.align)?'auto':'0';dom.style.marginRight=node.attrs.align==='right'?'0':'auto';graphic.style.height=node.attrs.height?node.attrs.height+'px':'';if(imageNode){if(img.getAttribute('src')!==node.attrs.src)img.src=node.attrs.src;img.alt=node.attrs.alt;img.title=node.attrs.title;img.style.objectFit=node.attrs.crop;caption.textContent=node.attrs.caption;}else{title.textContent=node.attrs.title;try{graphic.innerHTML=renderDiagram(node.attrs.kind,node.attrs.data,node.attrs.title,node.attrs.variant);}catch{graphic.textContent='Edit this chart to correct its data.';}}};
 const graphEditing=imageNode?undefined:attachGraphEditing({editor,getPos},graphic,()=>node);
 render();graphEditing?.refresh();
 return {dom,update(next:typeof node){if(next.type!==node.type)return false;node=next;render();graphEditing?.refresh();return true;},selectNode(){selected=true;dom.classList.add('ProseMirror-selectednode');},deselectNode(){selected=false;graphEditing?.deselect();dom.classList.remove('ProseMirror-selectednode');},stopEvent(event:Event){return !!(event.target as Element).closest('button,.note-graph-ui,[data-for-node],[data-node-id],[data-edge-id],[data-category-id]')||selected&&event.type==='dblclick';},ignoreMutation(){return true;},destroy(){graphEditing?.destroy();}};
}
