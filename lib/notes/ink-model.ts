/** Bounded vector protocol shared by the editor, server, reader and PDF output. */
export type InkPoint=[number,number,number];
export type InkStroke={id:string;tool:'pen'|'highlighter'|'line'|'rectangle'|'ellipse';color:string;width:number;points:InkPoint[]};
export type InkData={version:1;strokes:InkStroke[]};
export const EMPTY_INK:InkData={version:1,strokes:[]};
export const INK_WIDTH=1000,INK_HEIGHT=600,INK_POINTS=4000;
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateInk(value:unknown):InkData{
 const bad=()=>{throw Error('This drawing is invalid or too large. Split your work into smaller drawing blocks.');};
 if(!value||typeof value!=='object'||Array.isArray(value))return bad();
 const data=value as InkData;if(data.version!==1||Object.keys(data).some(k=>!['version','strokes'].includes(k))||!Array.isArray(data.strokes)||data.strokes.length>400)return bad();
 const ids=new Set<string>();let points=0;
 for(const s of data.strokes){
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['id','tool','color','width','points'].includes(k))||typeof s.id!=='string'||!/^[-\w]{1,100}$/.test(s.id)||ids.has(s.id)||!['pen','highlighter','line','rectangle','ellipse'].includes(s.tool)||!/^#[\da-f]{6}$/i.test(s.color)||!finite(s.width,1,32)||!Array.isArray(s.points)||!s.points.length||s.points.length>4000)return bad();
  ids.add(s.id);points+=s.points.length;if(points>INK_POINTS||s.points.some(p=>!Array.isArray(p)||p.length!==3||!finite(p[0],0,INK_WIDTH)||!finite(p[1],0,INK_HEIGHT)||!finite(p[2],0,1)))return bad();
  if(['line','rectangle','ellipse'].includes(s.tool)&&s.points.length!==2)return bad();
 }
 return data;
}
export function parseInk(data:unknown){if(typeof data!=='string'||data.length>220000)throw Error('Invalid drawing data.');return validateInk(JSON.parse(data));}
export function inkBounds(strokes:InkStroke[]){const points=strokes.flatMap(s=>s.points);if(!points.length)return null;return {x:Math.min(...points.map(p=>p[0])),y:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))};}
const n=(v:number)=>Math.round(v*100)/100;
export function transformInk(strokes:InkStroke[],ids:Set<string>,dx:number,dy:number,scale=1):InkStroke[]{
 const box=inkBounds(strokes.filter(s=>ids.has(s.id)));if(!box)return strokes;
 scale=Math.max(.1,Math.min(scale,(INK_WIDTH-box.x)/Math.max(1,box.right-box.x),(INK_HEIGHT-box.y)/Math.max(1,box.bottom-box.y)));
 dx=Math.max(-box.x,Math.min(INK_WIDTH-(box.x+(box.right-box.x)*scale),dx));dy=Math.max(-box.y,Math.min(INK_HEIGHT-(box.y+(box.bottom-box.y)*scale),dy));
 return strokes.map(s=>ids.has(s.id)?{...s,points:s.points.map(p=>[n(box.x+(p[0]-box.x)*scale+dx),n(box.y+(p[1]-box.y)*scale+dy),p[2]] as InkPoint)}:s);
}
export function inkInside(point:InkPoint,polygon:InkPoint[]){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function inkHit(s:InkStroke,p:InkPoint,radius=10){
 let points=s.points;if(s.tool==='rectangle'){const [a,b]=points;points=[a,[b[0],a[1],.5],b,[a[0],b[1],.5],a];}else if(s.tool==='ellipse'){const [a,b]=points;points=Array.from({length:49},(_,i)=>[(a[0]+b[0])/2+Math.abs(b[0]-a[0])/2*Math.cos(i*Math.PI/24),(a[1]+b[1])/2+Math.abs(b[1]-a[1])/2*Math.sin(i*Math.PI/24),.5] as InkPoint);}
 if(points.length===1)return Math.hypot(points[0][0]-p[0],points[0][1]-p[1])<=radius+s.width/2;
 return points.slice(1).some((b,i)=>{const a=points[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=radius+s.width/2;});
}
export function renderInkStroke(s:InkStroke){
 const common=`fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"`,a=s.points[0],b=s.points.at(-1)!;let shape='';
 if(s.tool==='rectangle')shape=`<rect ${common} x="${n(Math.min(a[0],b[0]))}" y="${n(Math.min(a[1],b[1]))}" width="${n(Math.abs(b[0]-a[0]))}" height="${n(Math.abs(b[1]-a[1]))}"/>`;
 else if(s.tool==='ellipse')shape=`<ellipse ${common} cx="${n((a[0]+b[0])/2)}" cy="${n((a[1]+b[1])/2)}" rx="${n(Math.abs(b[0]-a[0])/2)}" ry="${n(Math.abs(b[1]-a[1])/2)}"/>`;
 else if(s.tool==='line')shape=`<path ${common} d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}"/>`;
 else if(s.points.length===1)shape=`<circle cx="${a[0]}" cy="${a[1]}" r="${s.width/2}" fill="${s.color}"/>`;
 else if(s.tool==='highlighter')shape=`<polyline ${common} points="${s.points.map(p=>`${p[0]},${p[1]}`).join(' ')}"/>`;
 else {const bands=['','','',''];s.points.slice(1).forEach((p,i)=>{const a=s.points[i],band=Math.min(3,Math.floor((p[2]+a[2])*2));bands[band]+=`M${a[0]} ${a[1]}L${p[0]} ${p[1]}`;});shape=bands.map((d,i)=>d?`<path fill="none" stroke="${s.color}" stroke-width="${n(s.width*(.35+.65*(i+.5)/4))}" stroke-linecap="round" d="${d}"/>`:'').join('');}
 return `<g data-ink-id="${s.id}"${s.tool==='highlighter'?' opacity="0.28"':''}>${shape}</g>`;
}
export function renderInk(data:InkData,label='Handwriting'){validateInk(data);const safe=label.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" role="img" aria-label="${safe}" style="display:block;width:100%;height:auto;max-width:100%">${data.strokes.map(renderInkStroke).join('')}</svg>`;}
