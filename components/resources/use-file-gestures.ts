'use client';
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
export type FileDragPhase='start'|'move'|'drop'|'cancel';
type Point={x:number;y:number};
type Rectangle=Point&{width:number;height:number};
type Options={canvas:RefObject<HTMLElement|null>;selected:string[];blocked:boolean;onSelection:(keys:string[])=>void;onTouchDrag?:(keys:string[],phase:FileDragPhase,x:number,y:number)=>void};
/** Mouse marquee and long-press touch dragging leave ordinary touch scrolling and pinch input alone. */
export function useFileGestures(options:Options){
 const latest=useRef(options);useLayoutEffect(()=>{latest.current=options;});
 const [rectangle,setRectangle]=useState<Rectangle|null>(null),[dragPreview,setDragPreview]=useState<(Point&{count:number})|null>(null);
 useEffect(()=>{
  const canvas=options.canvas.current;if(!canvas)return;
  let gesture:{id:number;start:Point;point:Point;kind:'marquee'|'touch';active:boolean;keys:string[];base:string[]}|null=null;
  let timer=0,frame=0,suppressUntil=0;
  const clear=()=>{clearTimeout(timer);cancelAnimationFrame(frame);gesture=null;setRectangle(null);setDragPreview(null);delete document.body.dataset.resourceTouchdrag;};
  const point=(event:PointerEvent)=>({x:event.clientX,y:event.clientY});
  const scroll=()=>{if(!gesture?.active||gesture.kind!=='touch')return;const groups=canvas.querySelector('.fm-groups');if(groups){const box=groups.getBoundingClientRect(),{x,y}=gesture.point;if(x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom){const before=groups.scrollTop;groups.scrollTop+=y<box.top+36?-8:y>box.bottom-36?8:0;if(groups.scrollTop!==before)latest.current.onTouchDrag?.(gesture.keys,'move',x,y);}}frame=requestAnimationFrame(scroll);};
  const start=(event:PointerEvent)=>{
   if(gesture){latest.current.onTouchDrag?.(gesture.keys,'cancel',event.clientX,event.clientY);clear();return;}
   if(latest.current.blocked||event.button!==0||!(event.target instanceof Element))return;
   const row=event.target.closest<HTMLElement>('[data-file-key]');
   if(event.pointerType==='touch'&&row&&latest.current.onTouchDrag&&!event.target.closest('.fm-file-info,input,a')){
    const key=row.dataset.fileKey!;gesture={id:event.pointerId,start:point(event),point:point(event),kind:'touch',active:false,keys:latest.current.selected.includes(key)?latest.current.selected:[key],base:[]};
    timer=window.setTimeout(()=>{if(!gesture||latest.current.blocked)return;gesture.active=true;latest.current.onSelection(gesture.keys);document.body.dataset.resourceTouchdrag='true';setDragPreview({...gesture.point,count:gesture.keys.length});latest.current.onTouchDrag?.(gesture.keys,'start',gesture.point.x,gesture.point.y);frame=requestAnimationFrame(scroll);},350);return;
   }
   if(event.pointerType!=='mouse'||row||!event.target.closest('.fm-groups')||event.target.closest('button,input,a,select'))return;
   event.preventDefault();gesture={id:event.pointerId,start:point(event),point:point(event),kind:'marquee',active:false,keys:[],base:event.ctrlKey||event.metaKey||event.shiftKey?[...latest.current.selected]:[]};canvas.setPointerCapture(event.pointerId);
  };
  const move=(event:PointerEvent)=>{
   if(!gesture||event.pointerId!==gesture.id)return;
   gesture.point=point(event);
   if(!gesture.active&&Math.hypot(event.clientX-gesture.start.x,event.clientY-gesture.start.y)<7)return;
   if(gesture.kind==='touch'){
    if(!gesture.active){clear();return;}
    event.preventDefault();setDragPreview({...gesture.point,count:gesture.keys.length});latest.current.onTouchDrag?.(gesture.keys,'move',event.clientX,event.clientY);return;
   }
   gesture.active=true;const bounds=canvas.querySelector('.fm-groups')!.getBoundingClientRect();const x=Math.max(bounds.left,Math.min(event.clientX,bounds.right)),y=Math.max(bounds.top,Math.min(event.clientY,bounds.bottom));
   const rect={x:Math.min(gesture.start.x,x),y:Math.min(gesture.start.y,y),width:Math.abs(x-gesture.start.x),height:Math.abs(y-gesture.start.y)};setRectangle(rect);
   const keys=Array.from(canvas.querySelectorAll<HTMLElement>('[data-file-key]')).filter(node=>{const box=node.getBoundingClientRect();return box.bottom>bounds.top&&box.top<bounds.bottom&&box.left<rect.x+rect.width&&box.right>rect.x&&box.top<rect.y+rect.height&&box.bottom>rect.y;}).map(node=>node.dataset.fileKey!);
   latest.current.onSelection([...new Set([...gesture.base,...keys])]);
  };
  const finish=(event:PointerEvent)=>{if(!gesture||event.pointerId!==gesture.id)return;if(gesture.active){suppressUntil=performance.now()+400;if(gesture.kind==='touch')latest.current.onTouchDrag?.(gesture.keys,event.type==='pointercancel'?'cancel':'drop',event.clientX,event.clientY);}if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);clear();};
  const touchmove=(event:TouchEvent)=>{if(gesture?.kind==='touch'&&gesture.active&&event.touches.length===1)event.preventDefault();};
  const click=(event:MouseEvent)=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopPropagation();suppressUntil=0;}};
  const context=(event:MouseEvent)=>{if(gesture?.kind==='touch'&&gesture.active){event.preventDefault();event.stopPropagation();}};
  const nativeDrag=(event:DragEvent)=>{if(gesture?.kind==='touch'&&gesture.active)event.preventDefault();};
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('click',click,true);canvas.addEventListener('contextmenu',context,true);canvas.addEventListener('dragstart',nativeDrag,true);document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);document.addEventListener('touchmove',touchmove,{passive:false});
  return()=>{clearTimeout(timer);cancelAnimationFrame(frame);delete document.body.dataset.resourceTouchdrag;canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('click',click,true);canvas.removeEventListener('contextmenu',context,true);canvas.removeEventListener('dragstart',nativeDrag,true);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',finish);document.removeEventListener('touchmove',touchmove);};
 },[options.canvas]);
 return{rectangle,dragPreview};
}
