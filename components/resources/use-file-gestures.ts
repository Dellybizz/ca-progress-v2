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
  let gesture:{id:number;start:Point;point:Point;kind:'marquee'|'touch';active:boolean;keys:string[];base:string[];scroll:Point}|null=null;
  let timer=0,frame=0,suppressUntil=0;
  const clear=()=>{clearTimeout(timer);cancelAnimationFrame(frame);gesture=null;setRectangle(null);setDragPreview(null);delete document.body.dataset.resourceTouchdrag;};
  const point=(event:PointerEvent)=>({x:event.clientX,y:event.clientY});
  const updateMarquee=()=>{
   if(!gesture||gesture.kind!=='marquee')return;
   const groups=canvas.querySelector('.fm-groups');if(!groups)return;
   const bounds=groups.getBoundingClientRect(),x=Math.max(bounds.left,Math.min(gesture.point.x,bounds.right)),y=Math.max(bounds.top,Math.min(gesture.point.y,bounds.bottom));
   // Keep the anchor attached to the original content while the viewport scrolls.
   const anchor={x:gesture.start.x+gesture.scroll.x-groups.scrollLeft,y:gesture.start.y+gesture.scroll.y-groups.scrollTop};
   const rect={x:Math.min(anchor.x,x),y:Math.min(anchor.y,y),width:Math.abs(x-anchor.x),height:Math.abs(y-anchor.y)};
   const left=Math.max(bounds.left,rect.x),top=Math.max(bounds.top,rect.y);
   setRectangle({x:left,y:top,width:Math.max(0,Math.min(bounds.right,rect.x+rect.width)-left),height:Math.max(0,Math.min(bounds.bottom,rect.y+rect.height)-top)});
   const keys=Array.from(canvas.querySelectorAll<HTMLElement>('[data-file-key]')).filter(node=>{const box=node.getBoundingClientRect();return box.left<rect.x+rect.width&&box.right>rect.x&&box.top<rect.y+rect.height&&box.bottom>rect.y;}).map(node=>node.dataset.fileKey!);
   latest.current.onSelection([...new Set([...gesture.base,...keys])]);
  };
  let previousFrame=0;
  const scroll=(time:number)=>{
   if(!gesture?.active)return;
   const groups=canvas.querySelector('.fm-groups');
   if(groups){
    const box=groups.getBoundingClientRect(),{x,y}=gesture.point,edge=44;
    const direction=y<box.top+edge?-Math.min(1,(box.top+edge-y)/edge):y>box.bottom-edge?Math.min(1,(y-box.bottom+edge)/edge):0;
    const elapsed=previousFrame?Math.min(32,time-previousFrame):16;
    if(x>=box.left-32&&x<=box.right+32&&direction){
     const before=groups.scrollTop;groups.scrollTop+=direction*elapsed*(gesture.kind==='marquee'?0.9:0.5);
     if(groups.scrollTop!==before){if(gesture.kind==='marquee')updateMarquee();else latest.current.onTouchDrag?.(gesture.keys,'move',x,y);}
    }
   }
   previousFrame=time;frame=requestAnimationFrame(scroll);
  };
  const start=(event:PointerEvent)=>{
   if(gesture){latest.current.onTouchDrag?.(gesture.keys,'cancel',event.clientX,event.clientY);clear();return;}
   if(latest.current.blocked||event.button!==0||!(event.target instanceof Element))return;
   const row=event.target.closest<HTMLElement>('[data-file-key]');
   if(event.pointerType==='touch'&&row&&latest.current.onTouchDrag&&!event.target.closest('.fm-file-info,input,a')){
    const key=row.dataset.fileKey!;gesture={id:event.pointerId,start:point(event),point:point(event),kind:'touch',active:false,keys:latest.current.selected.includes(key)?latest.current.selected:[key],base:[],scroll:{x:0,y:0}};
    timer=window.setTimeout(()=>{if(!gesture||latest.current.blocked)return;gesture.active=true;latest.current.onSelection(gesture.keys);document.body.dataset.resourceTouchdrag='true';setDragPreview({...gesture.point,count:gesture.keys.length});latest.current.onTouchDrag?.(gesture.keys,'start',gesture.point.x,gesture.point.y);frame=requestAnimationFrame(scroll);},350);return;
   }
   if(event.pointerType!=='mouse'||row||!event.target.closest('.fm-groups')||event.target.closest('button,input,a,select'))return;
   event.preventDefault();gesture={id:event.pointerId,start:point(event),point:point(event),kind:'marquee',active:false,keys:[],base:event.ctrlKey||event.metaKey||event.shiftKey?[...latest.current.selected]:[],scroll:{x:canvas.querySelector('.fm-groups')!.scrollLeft,y:canvas.querySelector('.fm-groups')!.scrollTop}};canvas.setPointerCapture(event.pointerId);
  };
  const move=(event:PointerEvent)=>{
   if(!gesture||event.pointerId!==gesture.id)return;
   gesture.point=point(event);
   if(!gesture.active&&Math.hypot(event.clientX-gesture.start.x,event.clientY-gesture.start.y)<7)return;
   if(gesture.kind==='touch'){
    if(!gesture.active){clear();return;}
    event.preventDefault();setDragPreview({...gesture.point,count:gesture.keys.length});latest.current.onTouchDrag?.(gesture.keys,'move',event.clientX,event.clientY);return;
   }
   if(!gesture.active){gesture.active=true;previousFrame=0;frame=requestAnimationFrame(scroll);}updateMarquee();
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
