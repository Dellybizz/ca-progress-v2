'use client';
import {clamp,freePosition} from './manipulation';
export function applyObjectPosition(dom:HTMLElement,value:unknown,root:HTMLElement,enabled:boolean){
 const p=freePosition(value);if(!p){delete dom.dataset.notePosition;dom.style.removeProperty('left');dom.style.removeProperty('top');dom.style.removeProperty('position');return;}
 dom.dataset.notePosition=String(value);if(!enabled){dom.style.removeProperty('left');dom.style.removeProperty('top');dom.style.removeProperty('position');return;}
 const css=getComputedStyle(root),innerWidth=parseFloat(css.getPropertyValue('--register-inner-width'))||root.clientWidth,innerHeight=parseFloat(css.getPropertyValue('--register-inner-height'))||root.clientHeight,stride=parseFloat(css.getPropertyValue('--register-stride'))||innerWidth;
 if(dom.offsetHeight>innerHeight){dom.style.removeProperty('position');dom.style.removeProperty('left');dom.style.removeProperty('top');return;}
 dom.style.position='absolute';dom.style.left=((p.page-1)*stride+clamp(p.x,0,innerWidth-dom.offsetWidth))+'px';dom.style.top=clamp(p.y,0,innerHeight-dom.offsetHeight)+'px';
}
export function positionPrintedObjects(root:HTMLElement){for(const el of root.querySelectorAll<HTMLElement>('[data-note-position]'))applyObjectPosition(el,el.dataset.notePosition,root,true);}
