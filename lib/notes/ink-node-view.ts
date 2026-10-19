'use client';
import {Node,type NodeViewRendererProps} from '@tiptap/core';
import {closeHistory} from '@tiptap/pm/history';
import {EMPTY_INK,parseInk,validateInk,renderInkStroke,inkInside,inkBounds,inkHit,transformInk,type InkPoint,type InkStroke,type InkData,INK_POINTS} from './ink-model';

/** A drawing is a document block: strokes retain fixed coordinates as surrounding text reflows. */
export const Ink=Node.create({name:'ink',group:'block',atom:true,draggable:false,
 addAttributes(){return {data:{default:JSON.stringify(EMPTY_INK)},label:{default:'Handwriting'},width:{default:100}};},
 parseHTML(){return [];}, // Ink is accepted only through the validated structured protocol, never pasted SVG.
 renderHTML({node,HTMLAttributes}){return ['figure',{...HTMLAttributes,class:'note-ink-output'},['figcaption',node.attrs.label],['div','Handwriting · open the structured note to edit']];},
 addNodeView(){return inkNodeView;}
});
type Tool='text'|'pen'|'highlighter'|'eraser'|'lasso'|'line'|'rectangle'|'ellipse';
function inkNodeView({node:initial,editor,getPos}:NodeViewRendererProps){
 let errorMessage='';let node=initial,data=parseInk(node.attrs.data),tool:Tool='text',color='#2563eb',width=3,finger=false,selection=new Set<string>(),active:number|null=null,cancelGesture:(()=>void)|null=null;
 const dom=document.createElement('figure');dom.className='note-ink';dom.contentEditable='false';
 const toolbar=document.createElement('div');toolbar.className='note-ink-tools';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Handwriting tools');
 const top=document.createElement('div');top.className='note-ink-heading';
 const label=document.createElement('input');label.value=node.attrs.label;label.maxLength=160;label.setAttribute('aria-label','Drawing label');
 const status=document.createElement('span');status.className='note-ink-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 top.append(label,status);dom.append(top,toolbar);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 600');svg.setAttribute('aria-label','Drawing surface');svg.setAttribute('role','group');svg.setAttribute('tabindex','0');svg.classList.add('note-ink-canvas');
 const graphic=document.createElementNS(svg.namespaceURI,'g'),overlay=document.createElementNS(svg.namespaceURI,'g');svg.append(graphic,overlay);dom.append(svg);
 const hint=document.createElement('div');hint.className='note-ink-hint';hint.textContent='Anchored drawing · Text scrolls · Draw with pen or mouse · Enable finger drawing for touch';dom.append(hint);
 function selectNode(){const pos=getPos();if(typeof pos==='number')editor.commands.setNodeSelection(pos);}
 function commit(next:InkData,patch:Record<string,unknown>={}){
  try{validateInk(next);errorMessage='';const pos=getPos();if(typeof pos!=='number')return;const tr=closeHistory(editor.state.tr).setNodeMarkup(pos,undefined,{...node.attrs,...patch,data:JSON.stringify(next)});editor.view.dispatch(tr);editor.view.dispatch(closeHistory(editor.state.tr));}
  catch(error){errorMessage=error instanceof Error?error.message:'Drawing could not be saved.';render();}
 }
 label.onchange=()=>commit(data,{label:label.value.trim()||'Handwriting'});
 const icons:Record<string,string>={Select:'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4',Shrink:'M5 12h14 M12 5v14 M5 12l3-3 M5 12l3 3 M19 12l-3-3 M19 12l-3 3',Enlarge:'M4 12h16 M12 4v16 M4 12l3-3 M4 12l3 3 M20 12l-3-3 M20 12l-3 3',Delete:'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 10v7 M14 10v7',Text:'M4 5h16M12 5v14M8 19h8',Pen:'m4 20 4-1L20 7l-3-3L5 16Z M14 7l3 3',Highlighter:'m5 15 8-8 5 5-8 8H5Z M13 7l2-3 5 5-2 3',Eraser:'m4 14 8-10 8 7-8 9H9Z M8 10l8 7',Lasso:'M18 15c5-6 0-12-7-11S1 13 6 17s12 3 12-1c0-4-7-3-7 1s2 5 5 4',Line:'M4 20 20 4',Rectangle:'M4 5h16v14H4Z',Ellipse:'M20 12a8 6 0 1 1-16 0 8 6 0 1 1 16 0',Undo:'m8 4-5 5 5 5 M3 9h10a7 7 0 0 1 0 14',Redo:'m16 4 5 5-5 5 M21 9h-10a7 7 0 0 0 0 14'};
 function button(name:string,action:()=>void,icon?:string){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',name);b.title=name;if(icon){b.innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[icon]}"/></svg>`;}else b.textContent=name;b.onclick=event=>{event.preventDefault();event.stopPropagation();action();};toolbar.append(b);return b;}
 const tools=new Map<Tool,HTMLButtonElement>();
 for(const [id,name] of [['text','Text'],['pen','Pen'],['highlighter','Highlighter'],['eraser','Eraser'],['lasso','Lasso'],['line','Line'],['rectangle','Rectangle'],['ellipse','Ellipse']] as [Tool,string][]){tools.set(id,button(name,()=>{cancelGesture?.();tool=id;selectNode();renderTools();},name));}
 const colorLabel=document.createElement('label');colorLabel.className='note-ink-color';colorLabel.title='Ink colour';const colorInput=document.createElement('input');colorInput.type='color';colorInput.value=color;colorInput.setAttribute('aria-label','Ink colour');colorInput.oninput=()=>{color=colorInput.value;};colorLabel.append(colorInput);toolbar.append(colorLabel);
 const size=document.createElement('select');size.setAttribute('aria-label','Stroke width');for(const v of [2,3,5,8,12,20]){const o=document.createElement('option');o.value=String(v);o.textContent=v+' px';size.append(o);}size.value=String(width);size.onchange=()=>{width=Number(size.value);};toolbar.append(size);
 const fingerLabel=document.createElement('label');fingerLabel.className='note-ink-finger';const fingerInput=document.createElement('input');fingerInput.type='checkbox';fingerInput.onchange=()=>{cancelGesture?.();finger=fingerInput.checked;renderTools();};fingerLabel.append(fingerInput,'Finger draw');toolbar.append(fingerLabel);
 const undo=button('Undo ink',()=>{cancelGesture?.();editor.commands.undo();},'Undo'),redo=button('Redo ink',()=>{cancelGesture?.();editor.commands.redo();},'Redo');
 const selectAll=button('Select all ink',()=>{tool='lasso';selection=new Set(data.strokes.map(s=>s.id));renderTools();render();},'Select');
 const smaller=button('Shrink selected ink',()=>resize(.9),'Shrink'),larger=button('Enlarge selected ink',()=>resize(1.1),'Enlarge');
 const remove=button('Delete selected ink',()=>{commit({version:1,strokes:data.strokes.filter(s=>!selection.has(s.id))});selection.clear();render();},'Delete');
 const widthSelect=document.createElement('select');widthSelect.setAttribute('aria-label','Drawing width');for(const v of [50,75,100]){const o=document.createElement('option');o.value=String(v);o.textContent=v+'%';widthSelect.append(o);}widthSelect.value=String(node.attrs.width);widthSelect.onchange=()=>commit(data,{width:Number(widthSelect.value)});toolbar.append(widthSelect);
 button('Delete drawing',()=>{cancelGesture?.();const pos=getPos();if(typeof pos==='number')editor.view.dispatch(closeHistory(editor.state.tr).delete(pos,pos+node.nodeSize));},'Delete');
 function resize(scale:number){if(selection.size)commit({version:1,strokes:transformInk(data.strokes,selection,0,0,scale)});}
 function renderTools(){for(const [id,b] of tools)b.setAttribute('aria-pressed',String(id===tool));svg.style.touchAction=tool==='text'||!finger?'pan-y pinch-zoom':'none';svg.dataset.mode=tool;}
 function renderSelection(){overlay.innerHTML='';const box=inkBounds(data.strokes.filter(s=>selection.has(s.id)));if(box){const rect=document.createElementNS(svg.namespaceURI,'rect');for(const [k,v]of Object.entries({x:box.x-4,y:box.y-4,width:Math.max(8,box.right-box.x+8),height:Math.max(8,box.bottom-box.y+8),fill:'none',stroke:'#2563eb','stroke-width':2,'stroke-dasharray':'6 4'}))rect.setAttribute(k,String(v));overlay.append(rect);}for(const b of [smaller,larger,remove])b.disabled=!selection.size;}
 function render(){graphic.innerHTML=data.strokes.map(renderInkStroke).join('');label.value=node.attrs.label;dom.style.width=node.attrs.width+'%';widthSelect.value=String(node.attrs.width);selection=new Set([...selection].filter(id=>data.strokes.some(s=>s.id===id)));renderSelection();status.textContent=errorMessage||(data.strokes.length?`${data.strokes.length} strokes${selection.size?' · '+selection.size+' selected':''}`:'Blank drawing');undo.disabled=!editor.can().undo();redo.disabled=!editor.can().redo();selectAll.disabled=!data.strokes.length;}
 function point(e:PointerEvent):InkPoint{const matrix=svg.getScreenCTM();if(!matrix)return [0,0,.5];const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return [Math.round(Math.max(0,Math.min(1000,p.x))*100)/100,Math.round(Math.max(0,Math.min(600,p.y))*100)/100,e.pointerType==='pen'?Math.round(Math.max(.05,Math.min(1,e.pressure))*100)/100:.5];}
 svg.onpointerdown=e=>{
  if(active!==null||tool==='text'||e.pointerType==='touch'&&!finger||e.button!==0&&e.button!==5)return;
  e.preventDefault();e.stopPropagation();selectNode();svg.focus({preventScroll:true});active=e.pointerId;svg.setPointerCapture(e.pointerId);
  const mode=e.button===5?'eraser':tool,start=point(e),original=data.strokes,selectedBox=inkBounds(original.filter(s=>selection.has(s.id))),moving=mode==='lasso'&&selectedBox&&start[0]>=selectedBox.x-8&&start[0]<=selectedBox.right+8&&start[1]>=selectedBox.y-8&&start[1]<=selectedBox.bottom+8;
  const preview=document.createElementNS(svg.namespaceURI,'g');overlay.append(preview);let points:InkPoint[]=[start],next=original,moved=false,frame=0;const erased=new Set<string>();
  const stroke:InkStroke={id:crypto.randomUUID(),tool:mode==='eraser'||mode==='lasso'?'pen':mode,color,width:mode==='highlighter'?Math.min(32,width*3):width,points};
  const paint=()=>{frame=0;if(mode==='eraser'||moving)graphic.innerHTML=next.map(renderInkStroke).join('');else if(mode==='lasso')preview.innerHTML=`<polyline points="${points.map(p=>p.slice(0,2).join(',')).join(' ')}" fill="#2563eb10" stroke="#2563eb" stroke-width="2" stroke-dasharray="6 4"/>`;else preview.innerHTML=renderInkStroke({...stroke,points});};
  function sample(event:PointerEvent){const p=point(event);moved ||= Math.hypot(p[0]-start[0],p[1]-start[1])>1;
   if(mode==='eraser'){for(const s of original)if(inkHit(s,p,Math.max(10,width)))erased.add(s.id);next=original.filter(s=>!erased.has(s.id));}
   else if(moving)next=transformInk(original,selection,p[0]-start[0],p[1]-start[1]);
   else if(['line','rectangle','ellipse'].includes(mode))points=[start,p];
   else if(points.length<4000&&original.reduce((n,s)=>n+s.points.length,0)+points.length<INK_POINTS){const last=points.at(-1)!;if(Math.hypot(p[0]-last[0],p[1]-last[1])>=.6)points.push(p);}
   if(!frame)frame=requestAnimationFrame(paint);
  }
  const move=(event:PointerEvent)=>{if(event.pointerId!==active)return;event.preventDefault();for(const eventPart of event.getCoalescedEvents?.().length?event.getCoalescedEvents():[event])sample(eventPart);};
  const cleanup=()=>{if(frame)cancelAnimationFrame(frame);svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',finish);svg.removeEventListener('pointercancel',abort);svg.removeEventListener('lostpointercapture',abort);const id=active;active=null;cancelGesture=null;if(id!==null&&svg.hasPointerCapture(id))svg.releasePointerCapture(id);};
  const abort=(event?:PointerEvent)=>{if(event&&event.pointerId!==active)return;cleanup();render();};
  const finish=(event:PointerEvent)=>{if(event.pointerId!==active)return;sample(event);cleanup();
   if(mode==='eraser'||moving){if(next!==original)commit({version:1,strokes:next});}
   else if(mode==='lasso'){selection=new Set(original.filter(s=>points.length>2?s.points.some(p=>inkInside(p,points)):inkHit(s,start)).map(s=>s.id));}
   else if(!['line','rectangle','ellipse'].includes(mode)||moved){commit({version:1,strokes:[...original,{...stroke,points}]});}
   render();
  };
  cancelGesture=abort;svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',finish);svg.addEventListener('pointercancel',abort);svg.addEventListener('lostpointercapture',abort);if(mode==='eraser')sample(e);
 };
 svg.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelGesture?.();selection.clear();tool='text';renderTools();render();return;}if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();cancelGesture?.();if(e.shiftKey)editor.commands.redo();else editor.commands.undo();}return;}if(!selection.size)return;if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopPropagation();remove.click();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const n=e.shiftKey?10:2;commit({version:1,strokes:transformInk(data.strokes,selection,e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0,e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0)});}};
 renderTools();render();
 return {dom,update(next:typeof node){if(next.type!==node.type)return false;cancelGesture?.();node=next;data=parseInk(node.attrs.data);render();return true;},stopEvent(){return true;},ignoreMutation(){return true;},selectNode(){dom.classList.add('ProseMirror-selectednode');},deselectNode(){dom.classList.remove('ProseMirror-selectednode');},destroy(){cancelGesture?.();}};
}
