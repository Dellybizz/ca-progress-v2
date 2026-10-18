'use client';
import type {NodeViewRendererProps} from '@tiptap/core';
import {pointerGesture,scrollParents} from './pointer-gesture';
import {RESIZE_HANDLES,resizeBox,snapBox} from './manipulation';
import {closeHistory} from '@tiptap/pm/history';
import {objectModel,renderObject,nodeSize,wrapNodeLabel,type GraphModel,type DiagramNode} from './chart-model';
import {addGraphNode,boundedLayout,deleteGraphNode,graphBranch,moveGraphNode,reparentGraph,resizeGraphNode,visibleGraph} from './object-actions';

/** Local graph UI. Pointer previews never dispatch a note transaction. */
export function attachGraphEditing({editor,getPos}:Pick<NodeViewRendererProps,'editor'|'getPos'>,graphic:HTMLElement,read:()=>NodeViewRendererProps['node']){
 let gesture:(()=>void)|undefined,selected='',hovered='',menuId='',menuType:'node'|'edge'='node',branch=false,zoom=1,suppressClick=false,destroyed=false;
 let lastActivation={id:'',time:0},snapping=false,viewScale=1,viewPadding=0;
 let stage:HTMLDivElement|undefined,tools:HTMLDivElement|undefined,pending:{model:GraphModel;expected:string}|undefined;
 const shell=document.createElement('div');shell.className='note-graph-ui note-graph-toolbar';shell.setAttribute('aria-label','Diagram canvas controls');
 const popup=document.createElement('div');popup.className='note-graph-ui note-graph-menu';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Element options');popup.contentEditable='false';
 const status=document.createElement('div');status.className='note-graph-ui note-graph-status';status.setAttribute('role','status');
 // Keep fixed menus outside the zoomed paper so viewport coordinates remain valid.
 graphic.after(status);document.body.append(popup);const dock=()=>{const workspace=editor.view.dom.closest('.note-studio')?.querySelector('.note-editing-dock');if(workspace&&shell.parentElement!==workspace)workspace.append(shell);};
 const current=()=>{const n=read(),m=objectModel(n.attrs.kind,n.attrs.data,n.attrs.variant);if(m.type!=='graph')throw Error('Choose a diagram.');return m;};
 const message=(error:unknown)=>{status.textContent=error instanceof Error?error.message:String(error);};
 const select=(type:'node'|'edge'|'category',id:string,edit=false)=>{
  const pos=getPos();if(typeof pos!=='number')return;
  graphic.dataset[type==='node'?'selectedNode':type==='edge'?'selectedEdge':'selectedCategory']=id;
  if(type==='node')selected=id;
  editor.commands.setNodeSelection(pos);editor.view.dom.dispatchEvent(new CustomEvent('ca-object-part',{detail:{blockId:read().attrs.blockId,type,id,edit}}));
 };
 const commit=(model:GraphModel,expected=String(read().attrs.data))=>{
  if(!editor.isEditable)return false;const pos=getPos();if(typeof pos!=='number')return false;
  const n=editor.state.doc.nodeAt(pos);if(n?.type.name!=='diagram'||n.attrs.data!==expected){message('This diagram changed. Select the element again.');refresh();return false;}
  if(JSON.stringify(model)===expected)return true;
  try{const data=JSON.stringify(model);objectModel(n.attrs.kind,data,n.attrs.variant);editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(pos,undefined,{...n.attrs,data}));status.textContent='';return true;}catch(error){message(error);refresh();return false;}
 };
 const flush=()=>{const draft=pending;pending=undefined;if(draft)commit(draft.model,draft.expected);};
 const closeMenu=(cancel=false)=>{if(cancel){pending=undefined;refresh();}else flush();menuId='';popup.hidden=true;popup.replaceChildren();};
 const button=(parent:HTMLElement,label:string,text:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.title=label;b.onclick=e=>{e.preventDefault();e.stopPropagation();try{flush();action();}catch(error){message(error);}};parent.append(b);return b;};
 const focusNode=(id:string)=>graphic.querySelector<SVGGElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
 const patch=(id:string,changes:Partial<DiagramNode>)=>{const m=current(),n=m.nodes.find(n=>n.id===id);if(!n)return;if(n.locked&&changes.locked!==false)throw Error('Unlock this element before editing.');commit({...m,nodes:m.nodes.map(n=>n.id===id?{...n,...changes}:n)});};
 const add=(id:string,relationship:'child'|'sibling'|'parent'|'free')=>{
  const key=crypto.randomUUID(),m=addGraphNode(current(),id,relationship,read().attrs.kind,key,crypto.randomUUID());
  if(commit(m)){select('node',key);refresh();openMenu('node',key,true);requestAnimationFrame(()=>{graphic.querySelector(`[data-node-id="${CSS.escape(key)}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});});}
 };
 const positionMenu=()=>{
  if(popup.hidden)return;const anchor=graphic.querySelector(`[data-${menuType}-id="${CSS.escape(menuId)}"]`)?.getBoundingClientRect();if(!anchor){closeMenu();return;}
  const viewport=window.visualViewport,left=viewport?.offsetLeft??0,top=Math.max(viewport?.offsetTop??0,graphic.closest('.note-scroll-canvas')?.getBoundingClientRect().top??0),right=left+(viewport?.width??innerWidth),bottom=(viewport?.offsetTop??0)+(viewport?.height??innerHeight);
  const width=Math.min(294,right-left-24),canRight=anchor.right+10+width<=right-12,canLeft=anchor.left-10-width>=left+12,below=bottom-anchor.bottom-22,above=anchor.top-top-22;
  const side=canRight||canLeft,putBelow=below>=above,available=side?bottom-top-24:Math.max(below,above);
  popup.style.maxHeight=Math.max(120,Math.min(500,available))+'px';popup.style.width=width+'px';const rect=popup.getBoundingClientRect();
  popup.style.left=Math.max(left+12,Math.min(right-rect.width-12,canRight?anchor.right+10:canLeft?anchor.left-10-rect.width:anchor.left))+'px';
  const proposed=side?anchor.top:putBelow?anchor.bottom+10:anchor.top-rect.height-10;
  popup.style.top=Math.max(top+12,Math.min(bottom-rect.height-12,proposed))+'px';
 };
 const field=(label:string,value:string|number,change:(value:string)=>void,type='text',parent:HTMLElement=popup)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type=type;input.value=String(value);input.setAttribute('aria-label',label);wrap.append(input);parent.append(wrap);input.onchange=()=>{try{flush();change(input.value);}catch(error){message(error);}};return input;};
 const choice=(label:string,value:string,values:[string,string][],change:(value:string)=>void,parent:HTMLElement=popup)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('select');input.setAttribute('aria-label',label);for(const [value,text]of values){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}input.value=value;input.onchange=()=>{try{flush();change(input.value);}catch(error){message(error);input.value=value;}};wrap.append(input);parent.append(wrap);return input;};
 function openMenu(type:'node'|'edge',id:string,edit=false){
  if(!editor.isEditable)return;closeMenu();menuId=id;menuType=type;select(type,id);refresh();const m=current(),node=m.nodes.find(n=>n.id===id),edge=m.edges.find(e=>e.id===id);if(type==='node'&&!node||type==='edge'&&!edge)return;
  popup.hidden=false;const heading=document.createElement('div');heading.className='note-graph-menu-heading';const strong=document.createElement('strong');strong.textContent=type==='node'?'Element options':'Connection options';heading.append(strong);button(heading,'Close element options','×',()=>{closeMenu();focusNode(selected);});popup.append(heading);
  const label=document.createElement('label');label.textContent=type==='node'?'Element text':'Connection label';const text=document.createElement('textarea');text.setAttribute('aria-label',label.textContent);text.maxLength=80;text.rows=2;text.value=node?.label??edge!.label;label.append(text);popup.append(label);
  text.disabled=Boolean(node?.locked);
  text.oninput=()=>{const original=String(read().attrs.data),base=current();const next=type==='node'?{...base,nodes:base.nodes.map(n=>n.id===id?{...n,label:text.value}:n)}:{...base,edges:base.edges.map(e=>e.id===id?{...e,label:text.value}:e)};pending={model:next,expected:original};draw(next,false);};text.onblur=flush;
  if(node){
   const colors=document.createElement('div');colors.className='note-graph-menu-grid three';popup.append(colors);
   for(const [key,label,fallback]of [['fill','Fill','#ffffff'],['color','Border',m.color],['textColor','Text colour','#334155']] as const)field(label,node[key]??fallback,value=>patch(id,{[key]:value}),'color',colors).disabled=Boolean(node.locked);
   const properties=document.createElement('div');properties.className='note-graph-menu-grid';popup.append(properties);
   choice('Shape',node.shape,[['box','Rounded box'],['decision','Decision'],['ellipse','Ellipse']],shape=>patch(id,{shape:shape as DiagramNode['shape']}),properties).disabled=Boolean(node.locked);
   const font=field('Text size',node.fontSize??12,value=>patch(id,{fontSize:Number(value)}),'number',properties);font.min='10';font.max='32';font.disabled=Boolean(node.locked);
   choice('Text alignment',node.textAlign??'center',[['left','Left'],['center','Centre'],['right','Right']],value=>patch(id,{textAlign:value as DiagramNode['textAlign']}),properties).disabled=Boolean(node.locked);
   const sizes=nodeSize(node);
   for(const [key,min,max]of [['width',80,600],['height',40,400]] as const){const input=field('Element '+key,sizes[key],value=>patch(id,{[key]:Number(value)}),'number',properties);input.min=String(min);input.max=String(max);input.disabled=Boolean(node.locked);}
   button(popup,'Fit element to text','Fit to text',()=>{const n=current().nodes.find(n=>n.id===id)!;const lines=wrapNodeLabel({...n,height:400}),height=Math.min(400,Math.max(40,Math.ceil(lines.length*(n.fontSize??12)*1.2+24)));patch(id,{height});}).disabled=Boolean(node.locked);
   if(read().attrs.kind!=='flow')choice('Parent',m.edges.find(e=>e.to===id)?.from??'',[['','No parent'],...m.nodes.filter(n=>!graphBranch(m,id).has(n.id)).map(n=>[n.id,n.label] as [string,string])],parent=>commit(reparentGraph(current(),id,parent,read().attrs.kind))).disabled=Boolean(node.locked);
   const actions=document.createElement('div');actions.className='note-graph-menu-grid';popup.append(actions);
   button(actions,'Add child element','+ Child',()=>add(id,'child')).disabled=m.nodes.length>=40;
   button(actions,'Add sibling element','+ Sibling',()=>add(id,'sibling')).disabled=m.nodes.length>=40;
   button(actions,'Duplicate element','Duplicate',()=>{const key=crypto.randomUUID();let next=addGraphNode(current(),id,'sibling',read().attrs.kind,key,crypto.randomUUID());next={...next,nodes:next.nodes.map(n=>n.id===key?{...node,...n,label:node.label,shape:node.shape,locked:false,collapsed:false,width:node.width,height:node.height,fill:node.fill,color:node.color,textColor:node.textColor,fontSize:node.fontSize,textAlign:node.textAlign}:n)};if(commit(next)){select('node',key);openMenu('node',key,true);}}).disabled=m.nodes.length>=40;
   if(m.edges.some(e=>e.from===id)&&read().attrs.kind!=='flow')button(actions,'Collapse or expand branch',node.collapsed?'Expand branch':'Collapse branch',()=>{patch(id,{collapsed:!current().nodes.find(n=>n.id===id)!.collapsed});closeMenu();}).disabled=Boolean(node.locked);
   branch=graphic.dataset.moveBranch==='true';const branchLabel=document.createElement('label');branchLabel.className='note-graph-check';const check=document.createElement('input');check.type='checkbox';check.checked=branch;check.setAttribute('aria-label','Move this whole branch');check.onchange=()=>{branch=check.checked;graphic.dataset.moveBranch=String(branch);editor.view.dom.dispatchEvent(new CustomEvent('ca-object-part',{detail:{blockId:read().attrs.blockId,type:'node',id,moveBranch:branch}}));};branchLabel.append(check,'Move whole branch');popup.append(branchLabel);
   button(actions,'Lock or unlock element',node.locked?'Unlock':'Lock position',()=>{patch(id,{locked:!current().nodes.find(n=>n.id===id)!.locked});openMenu('node',id);});
   button(actions,'Delete element keep children','Delete element',()=>{if(commit(deleteGraphNode(current(),id))){closeMenu();selected='';refresh();}}).disabled=m.nodes.length===1||Boolean(node.locked);
   if(m.edges.some(e=>e.from===id)){const remove=button(popup,'Delete entire branch','Delete branch…',()=>{remove.textContent='Confirm delete branch';remove.setAttribute('aria-label','Confirm delete branch');remove.onclick=()=>{try{if(commit(deleteGraphNode(current(),id,true))){closeMenu();selected='';refresh();}}catch(error){message(error);}};});remove.disabled=Boolean(node.locked)||graphBranch(m,id).size===m.nodes.length;}
  }else if(edge){
   field('Connection colour',edge.color??m.color,value=>commit({...current(),edges:current().edges.map(e=>e.id===id?{...e,color:value}:e)}),'color');
   choice('Connection line',edge.style??'straight',[['straight','Straight'],['elbow','Elbow']],value=>commit({...current(),edges:current().edges.map(e=>e.id===id?{...e,style:value as 'straight'|'elbow'}:e)}));
   choice('Connection pattern',edge.dashed?'dashed':'solid',[['solid','Solid'],['dashed','Dashed']],value=>commit({...current(),edges:current().edges.map(e=>e.id===id?{...e,dashed:value==='dashed'}:e)}));
   for(const endpoint of ['from','to'] as const)choice('Connection '+endpoint,edge[endpoint],m.nodes.map(n=>[n.id,n.label]),value=>{const base=current(),previous=base.edges.find(e=>e.id===id)!;const next={...previous,[endpoint]:value};if(next.from===next.to||read().attrs.kind!=='flow'&&(base.edges.some(e=>e.id!==id&&e.to===next.to)||graphBranch({...base,edges:base.edges.filter(e=>e.id!==id)},next.to).has(next.from)))throw Error('Choose a connection without a cycle or a second parent.');commit({...base,edges:base.edges.map(e=>e.id===id?next:e)});});
   button(popup,'Delete this connection','Delete connection',()=>{commit({...current(),edges:current().edges.filter(e=>e.id!==id)});closeMenu();});
  }
  positionMenu();if(edit){text.focus();text.select();}
 }
 function draw(model:GraphModel,rebuild=true){
  if(!stage)return;const {attrs}=read();const previousViewBox=stage.querySelector('svg')?.getAttribute('viewBox');stage.querySelector('svg')?.remove();stage.insertAdjacentHTML('afterbegin',renderObject(attrs.kind,model,attrs.title,attrs.variant));const svg=stage.querySelector('svg')!;
  if(!rebuild&&previousViewBox)svg.setAttribute('viewBox',previousViewBox);
  if(rebuild){const width=Number(svg.getAttribute('width'))||620,height=Number(svg.getAttribute('height'))||300,limit=parseFloat(graphic.style.height)||Infinity;const paperScale=graphic.getBoundingClientRect().width/graphic.offsetWidth||1;viewPadding=Math.min(24/paperScale,graphic.clientWidth*.2,Number.isFinite(limit)?limit*.2:100);viewScale=Math.max(.02,Math.min(1,(graphic.clientWidth-2*viewPadding)/width,(limit-2*viewPadding)/height)*zoom);stage.style.width=(width*viewScale+2*viewPadding)+'px';stage.style.height=(height*viewScale+2*viewPadding)+'px';}
  svg.style.position='absolute';svg.style.left=viewPadding+'px';svg.style.top=viewPadding+'px';svg.style.width=(parseFloat(stage.style.width)-2*viewPadding)+'px';svg.style.height=(parseFloat(stage.style.height)-2*viewPadding)+'px';svg.style.overflow='visible';
  tools?.remove();tools=document.createElement('div');tools.className='note-graph-node-overlays';stage.append(tools);
  for(const n of visibleGraph(model,attrs.kind).nodes){const size=nodeSize(n),group=document.createElement('div');group.className='note-graph-node-tools';group.dataset.forNode=n.id;group.dataset.active=String(n.id===selected||n.id===hovered);Object.assign(group.style,{left:(viewPadding+n.x*viewScale)+'px',top:(viewPadding+n.y*viewScale)+'px',width:size.width*viewScale+'px',height:size.height*viewScale+'px'});tools.append(group);
   const sibling=button(group,'Add sibling to '+n.label,'+',()=>add(n.id,'sibling'));sibling.className='note-graph-add sibling';sibling.disabled=model.nodes.length>=40;
   const child=button(group,'Add child to '+n.label,'+',()=>add(n.id,'child'));child.className='note-graph-add child';child.disabled=model.nodes.length>=40;
   if(n.id===selected){button(group,'Options for '+n.label,'⋯',()=>openMenu('node',n.id)).className='note-graph-options';if(!n.locked)for(const corner of RESIZE_HANDLES){const resize=button(group,'Resize element '+corner,'',()=>{});resize.className='note-graph-node-resize '+corner;resize.dataset.resize=corner;resize.dataset.resizeNode=n.id;}}
   stage.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`)?.setAttribute('data-selected',String(n.id===selected));
  }
 }
 function refresh(){
  if(destroyed)return;const graph=['hierarchy','tree','flow'].includes(read().attrs.kind);dock();shell.hidden=!graph||!editor.isEditable||editor.state.selection.from!==getPos();status.hidden=!graph;graphic.classList.toggle('is-direct-graph',graph&&editor.isEditable);
  if(!graph||!editor.isEditable){popup.hidden=true;if(graph){const n=read();graphic.innerHTML=renderObject(n.attrs.kind,current(),n.attrs.title,n.attrs.variant);stage=undefined;tools=undefined;}return;}
  try{const focused=graphic.contains(document.activeElement)?(document.activeElement as Element)?.closest<SVGElement>('[data-node-id]')?.dataset.nodeId:undefined;const model=current();stage=document.createElement('div');stage.className='note-graph-stage';graphic.replaceChildren(stage);draw(model);if(menuId&&!model.nodes.some(n=>n.id===menuId)&&menuType==='node'){pending=undefined;menuId='';popup.hidden=true;}positionMenu();if(focused)focusNode(focused);}catch(error){message(error);}
 }
 button(shell,'Add root element','+ Root',()=>add(selected||current().nodes[0].id,'free'));
 const snapControl=button(shell,'Snap diagram to guides','Snap',()=>{snapping=!snapping;snapControl.setAttribute('aria-pressed',String(snapping));});snapControl.setAttribute('aria-pressed','false');
 button(shell,'Auto arrange diagram','Arrange',()=>commit(boundedLayout(current(),read().attrs.variant==='Left to right')));
 const zoomText=document.createElement('span');zoomText.textContent='100%';
 const setZoom=(value:number)=>{zoom=Math.max(.25,Math.min(2,value));zoomText.textContent=Math.round(zoom*100)+'%';refresh();};
 button(shell,'Zoom diagram out','−',()=>setZoom(zoom-.1));shell.append(zoomText);button(shell,'Zoom diagram in','+',()=>setZoom(zoom+.1));button(shell,'Fit diagram in view','Fit',()=>{setZoom(1);});
 const hint=document.createElement('small');hint.textContent='Drag to move · Hold for options';shell.append(hint);
 const over=(event:PointerEvent)=>{const id=(event.target as Element).closest<SVGElement>('[data-node-id]')?.dataset.nodeId;if(!id||id===hovered)return;hovered=id;for(const group of graphic.querySelectorAll<HTMLElement>('[data-for-node]'))group.dataset.active=String(group.dataset.forNode===selected||group.dataset.forNode===hovered);};
 const click=(event:MouseEvent)=>{
  const el=event.target as Element;if(el.closest('.note-graph-node-tools'))return;
  const target=el.closest<SVGElement>('[data-node-id],[data-edge-id],[data-category-id]');if(!target)return;event.preventDefault();event.stopPropagation();
  if(suppressClick){suppressClick=false;return;}
  if(!editor.isEditable)return;
  if(target.hasAttribute('data-category-id')){select('category',target.dataset.categoryId!);return;}
  const type=target.hasAttribute('data-node-id')?'node':'edge',id=target.getAttribute('data-'+type+'-id')!;
  if(event.detail===0||!('sourceCapabilities'in event)||(event as MouseEvent & {sourceCapabilities?:{firesTouchEvents:boolean}}).sourceCapabilities?.firesTouchEvents!==true)openMenu(type,id);else{select(type,id);refresh();}
 };
 const double=(event:MouseEvent)=>{const target=(event.target as Element).closest<SVGElement>('[data-node-id],[data-edge-id]');if(!target)return;event.preventDefault();event.stopPropagation();openMenu(target.hasAttribute('data-node-id')?'node':'edge',target.dataset.nodeId??target.dataset.edgeId!,true);};
 const touches=new Map<number,{x:number;y:number}>();const pans=new Map<number,{x:number;y:number}>();let panOrigin:{x:number;y:number;left:number;top:number;distance:number;zoom:number}|undefined;
 const resetPan=()=>{const values=[...pans.values()],a=values[0],b=values[1];panOrigin=a?{x:b?(a.x+b.x)/2:a.x,y:b?(a.y+b.y)/2:a.y,left:graphic.scrollLeft,top:graphic.scrollTop,distance:b?Math.hypot(a.x-b.x,a.y-b.y):0,zoom}:undefined;};
 const panMove=(e:PointerEvent)=>{if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!pans.has(e.pointerId)||!panOrigin)return;e.preventDefault();pans.set(e.pointerId,{x:e.clientX,y:e.clientY});const [a,b]=[...pans.values()],x=b?(a.x+b.x)/2:a.x,y=b?(a.y+b.y)/2:a.y;if(b&&panOrigin.distance){const rect=graphic.getBoundingClientRect(),oldZoom=zoom;zoom=Math.max(.25,Math.min(2,panOrigin.zoom*Math.hypot(a.x-b.x,a.y-b.y)/panOrigin.distance));if(oldZoom!==zoom){zoomText.textContent=Math.round(zoom*100)+'%';refresh();}graphic.scrollLeft=(panOrigin.left+panOrigin.x-rect.left)*zoom/panOrigin.zoom-(x-rect.left);graphic.scrollTop=(panOrigin.top+panOrigin.y-rect.top)*zoom/panOrigin.zoom-(y-rect.top);}else{graphic.scrollLeft=panOrigin.left+panOrigin.x-x;graphic.scrollTop=panOrigin.top+panOrigin.y-y;}};
 const panEnd=(e:PointerEvent)=>{touches.delete(e.pointerId);pans.delete(e.pointerId);resetPan();graphic.classList.toggle('is-panning',pans.size>0);};
 const panStart=(e:PointerEvent)=>{e.preventDefault();e.stopPropagation();closeMenu();pans.set(e.pointerId,{x:e.clientX,y:e.clientY});resetPan();graphic.classList.add('is-panning');};
 const down=(event:PointerEvent)=>{
  if(!editor.isEditable||event.button!==0||(event.target as Element).closest('.note-graph-node-tools button:not([data-resize])'))return;
  if(event.pointerType==='touch'){touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(touches.size>1){event.preventDefault();event.stopPropagation();gesture?.();closeMenu();pans.clear();for(const [id,point] of touches)pans.set(id,point);resetPan();graphic.classList.add('is-panning');return;}}
  const target=(event.target as Element).closest<SVGElement>('[data-node-id]'),handle=(event.target as Element).closest<HTMLElement>('[data-resize-node]');
  if(pans.size||!target&&!handle){if((event.target as Element).closest('[data-edge-id],[data-category-id],button'))return;panStart(event);return;}event.preventDefault();event.stopPropagation();gesture?.();suppressClick=false;closeMenu();
  const original=read(),model=current(),id=handle?.dataset.resizeNode??target!.dataset.nodeId!,n=model.nodes.find(n=>n.id===id)!;selected=id;select('node',id);draw(model);focusNode(id);if(n.locked){openMenu('node',id);return;}
  const matrix=stage?.querySelector('svg')?.getScreenCTM();if(!matrix)return;const scaleX=Math.abs(matrix.a)||zoom,scaleY=Math.abs(matrix.d)||zoom,startX=event.clientX,startY=event.clientY,resize=handle?.dataset.resize as import('./manipulation').Handle|undefined,sz=nodeSize(n),initial=graphic.getBoundingClientRect(),scrollX=graphic.scrollLeft,scrollY=graphic.scrollTop,paperScale=initial.width/graphic.offsetWidth||1;let next=model,held=false;
  const timer=event.pointerType==='touch'&&!resize?window.setTimeout(()=>{held=true;suppressClick=true;openMenu('node',id);},500):undefined;
  const clearGuides=()=>stage?.querySelectorAll('.note-graph-guide').forEach(el=>el.remove());
  gesture=pointerGesture(event,graphic,{threshold:event.pointerType==='touch'?8:4,scroll:[graphic,...scrollParents(graphic)],move:point=>{
   if(held)return;clearTimeout(timer);suppressClick=true;const rect=graphic.getBoundingClientRect(),dx=(point.x-startX-(rect.left-initial.left)+(graphic.scrollLeft-scrollX)*paperScale)/scaleX,dy=(point.y-startY-(rect.top-initial.top)+(graphic.scrollTop-scrollY)*paperScale)/scaleY;
   try{if(resize){const box=resizeBox({x:n.x,y:n.y,...sz},resize,dx,dy,{minWidth:80,minHeight:40,maxWidth:resize.includes('w')?Math.min(600,n.x+sz.width):600,maxHeight:resize.includes('n')?Math.min(400,n.y+sz.height):400},point.shift&&!point.alt);next=resizeGraphNode(model,id,box.width,box.height,Math.max(0,box.x),Math.max(0,box.y));draw(next,false);}else{let x=n.x+dx,y=n.y+dy;let guides:ReturnType<typeof snapBox>|undefined;if(snapping&&!point.alt){guides=snapBox({x,y,...sz},model.nodes.filter(v=>v.id!==id).map(v=>({x:v.x,y:v.y,...nodeSize(v)})),{width:4000,height:4000},6/scaleX);x=guides.x;y=guides.y;}next=moveGraphNode(model,id,x,y,graphic.dataset.moveBranch==='true');draw(next,false);clearGuides();if(guides&&stage)for(const [axis,at]of [['x',guides.guideX],['y',guides.guideY]] as const){if(at===undefined)continue;const line=document.createElement('div');line.className='note-graph-guide '+axis;line.style[axis==='x'?'left':'top']=(viewPadding+at*viewScale)+'px';stage.append(line);}}}catch(error){message(error);}
  },finish:(cancelled,moved)=>{clearTimeout(timer);gesture=undefined;clearGuides();if(!cancelled&&!held&&moved)commit(next,original.attrs.data);refresh();if(moved)focusNode(id);if(!cancelled&&!moved&&!held&&!resize){suppressClick=true;if(event.pointerType!=='touch'){const now=performance.now(),edit=lastActivation.id===id&&now-lastActivation.time<350;lastActivation={id,time:now};openMenu('node',id,edit);}}if(held)positionMenu();}});

 };
 const keyboard=(event:KeyboardEvent)=>{
  if(!editor.isEditable)return;
  if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();flush();closeMenu();if(event.key.toLowerCase()==='y'||event.shiftKey)editor.commands.redo();else editor.commands.undo();refresh();return;}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true);focusNode(selected);return;}
  if((event.target as Element).closest('input,select,textarea')){event.stopPropagation();return;}
  const target=(event.target as Element).closest<SVGElement>('[data-node-id],[data-edge-id]');if(!target)return;
  const id=target.dataset.nodeId??target.dataset.edgeId!;if(['Enter','F2',' '].includes(event.key)){event.preventDefault();event.stopPropagation();openMenu(target.hasAttribute('data-node-id')?'node':'edge',id,event.key==='F2');return;}
  if(!target.hasAttribute('data-node-id')||!event.key.startsWith('Arrow'))return;event.preventDefault();event.stopPropagation();const m=current(),n=m.nodes.find(n=>n.id===id)!;const step=event.shiftKey?50:10;try{commit(moveGraphNode(m,id,n.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),n.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0),graphic.dataset.moveBranch==='true'));refresh();focusNode(id);}catch(error){message(error);}
 };
 let editable=editor.isEditable;const editableChanged=()=>{if(editable!==editor.isEditable){editable=editor.isEditable;refresh();}};editor.on('update',editableChanged);
 const selectionChanged=()=>{dock();shell.hidden=!editor.isEditable||editor.state.selection.from!==getPos();if(!popup.hidden&&editor.state.selection.from!==getPos())closeMenu();};editor.on('selectionUpdate',selectionChanged);
 let fitFrame=0;const fitObserver=new ResizeObserver(()=>{if(!fitFrame)fitFrame=requestAnimationFrame(()=>{fitFrame=0;if(!destroyed&&!gesture)refresh();});});fitObserver.observe(graphic);
 const checkpoint=()=>{if(document.visibilityState==='hidden')flush();};document.addEventListener('visibilitychange',checkpoint,true);window.addEventListener('pagehide',flush,true);
 const outside=(event:PointerEvent)=>{if(!popup.hidden&&!popup.contains(event.target as Node)&&!graphic.contains(event.target as Node))closeMenu();};
 window.addEventListener('pointermove',panMove,{passive:false});window.addEventListener('pointerup',panEnd);window.addEventListener('pointercancel',panEnd);graphic.addEventListener('pointerover',over);graphic.addEventListener('pointerdown',down);graphic.addEventListener('click',click);graphic.addEventListener('dblclick',double);graphic.addEventListener('keydown',keyboard);popup.addEventListener('keydown',keyboard);popup.addEventListener('pointerdown',e=>e.stopPropagation());popup.addEventListener('click',e=>e.stopPropagation());document.addEventListener('pointerdown',outside);window.addEventListener('resize',positionMenu);window.addEventListener('scroll',positionMenu,true);window.visualViewport?.addEventListener('resize',positionMenu);
 return {refresh,deselect(){closeMenu();selected='';hovered='';refresh();},destroy(){destroyed=true;cancelAnimationFrame(fitFrame);fitObserver.disconnect();document.removeEventListener('visibilitychange',checkpoint,true);window.removeEventListener('pagehide',flush,true);editor.off('update',editableChanged);editor.off('selectionUpdate',selectionChanged);gesture?.();pans.clear();window.removeEventListener('pointermove',panMove);window.removeEventListener('pointerup',panEnd);window.removeEventListener('pointercancel',panEnd);pending=undefined;graphic.removeEventListener('pointerover',over);graphic.removeEventListener('pointerdown',down);graphic.removeEventListener('click',click);graphic.removeEventListener('dblclick',double);graphic.removeEventListener('keydown',keyboard);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',positionMenu);window.removeEventListener('scroll',positionMenu,true);window.visualViewport?.removeEventListener('resize',positionMenu);shell.remove();popup.remove();status.remove();}};
}
