export type Handle='n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw';
export const RESIZE_HANDLES:Handle[]=['nw','n','ne','e','se','s','sw','w'];
export type Box={x:number;y:number;width:number;height:number};
export type FreePosition={version:1;page:number;x:number;y:number};
export function freePosition(value:unknown):FreePosition|null{
 if(value==null)return null;if(typeof value!=='string'||value.length>200)throw Error('Invalid object position.');let p:FreePosition;try{p=JSON.parse(value);}catch{throw Error('Invalid object position.');}
 if(!p||Object.keys(p).some(k=>!['version','page','x','y'].includes(k))||p.version!==1||!Number.isInteger(p.page)||p.page<1||p.page>5000||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=4000))throw Error('Invalid object position.');return p;
}
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(Math.max(min,max),n));
export function resizeBox(box:Box,handle:Handle,dx:number,dy:number,limits:{minWidth:number;minHeight:number;maxWidth:number;maxHeight:number},aspect=false):Box{
 const west=handle.includes('w'),north=handle.includes('n'),horizontal=west||handle.includes('e'),vertical=north||handle.includes('s');
 let width=horizontal?box.width+dx*(west?-1:1):box.width,height=vertical?box.height+dy*(north?-1:1):box.height;
 if(aspect){const factor=horizontal&&vertical?Math.abs(dx/box.width)>=Math.abs(dy/box.height)?width/box.width:height/box.height:horizontal?width/box.width:height/box.height;const bounded=clamp(factor,Math.max(limits.minWidth/box.width,limits.minHeight/box.height),Math.min(limits.maxWidth/box.width,limits.maxHeight/box.height));width=box.width*bounded;height=box.height*bounded;}else{width=horizontal?clamp(width,limits.minWidth,limits.maxWidth):box.width;height=vertical?clamp(height,limits.minHeight,limits.maxHeight):box.height;}
 return {x:Math.round(box.x+(west?box.width-width:0)),y:Math.round(box.y+(north?box.height-height:0)),width:Math.round(width),height:Math.round(height)};
}
export function snapBox(box:Box,targets:Box[],bounds:{width:number;height:number},tolerance=6){
 const xs=[0,bounds.width/2,bounds.width,...targets.flatMap(b=>[b.x,b.x+b.width/2,b.x+b.width])],ys=[0,bounds.height/2,bounds.height,...targets.flatMap(b=>[b.y,b.y+b.height/2,b.y+b.height])];
 const snap=(at:number,size:number,lines:number[])=>{let d=tolerance+1,delta=0,guide:number|undefined;for(const line of lines)for(const point of [at,at+size/2,at+size])if(Math.abs(line-point)<d){d=Math.abs(line-point);delta=line-point;guide=line;}return d<=tolerance?{value:at+delta,guide}:{value:Math.round(at/10)*10,guide:undefined};};
 const x=snap(box.x,box.width,xs),y=snap(box.y,box.height,ys);return {...box,x:Math.round(x.value),y:Math.round(y.value),guideX:x.guide,guideY:y.guide};
}
