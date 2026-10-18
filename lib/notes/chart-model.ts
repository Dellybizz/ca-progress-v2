/** Bounded, portable chart/diagram data. Legacy line data remains readable. */
export type ChartSeries={id:string;name:string;color:string;values:number[]};
export type DiagramNode={id:string;label:string;x:number;y:number;shape:'box'|'decision'|'ellipse';fill?:string;color?:string;textColor?:string;collapsed?:boolean};
export type DiagramEdge={id:string;from:string;to:string;label:string;color?:string;dashed?:boolean;style?:'straight'|'elbow'};
export type ChartModel={version:1;type:'chart';categories:string[];categoryIds?:string[];series:ChartSeries[];palette:string[];legend:boolean;labels:boolean;axes:boolean;numberFormat:'number'|'currency'|'percent';lineWidth:number;markers:boolean};
export type GraphModel={version:1;type:'graph';nodes:DiagramNode[];edges:DiagramEdge[];color:string};
export type ObjectModel=ChartModel|GraphModel;
export const chartColors=['#6366f1','#0d9488','#f59e0b','#e879a4','#60a5fa','#a78bfa'];
const finite=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const label=(s:unknown,max=80)=>typeof s==='string'&&s.length<=max;
const color=(s:unknown)=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
const keys=(o:object,allowed:string[])=>Object.keys(o).every(k=>allowed.includes(k));
export function validateObjectModel(kind:string,value:unknown):ObjectModel{
 const bad=()=>{throw Error('Invalid chart configuration. Check values, labels and connections.');};
 if(!value||typeof value!=='object'||Array.isArray(value))return bad();const m=value as ObjectModel;
 if(m.version!==1||JSON.stringify(m).length>40000)return bad();
 if(m.type==='chart'){
  if(!['bar','line','pie'].includes(kind)||!keys(m,['version','type','categories','categoryIds','series','palette','legend','labels','axes','numberFormat','lineWidth','markers'])||!Array.isArray(m.categories)||!m.categories.length||m.categories.length>40||m.categories.some(c=>!label(c)||!c.trim())||!Array.isArray(m.palette)||m.palette.length!==m.categories.length||m.palette.some(c=>!color(c))||!Array.isArray(m.series)||!m.series.length||m.series.length>6||!['number','currency','percent'].includes(m.numberFormat)||!finite(m.lineWidth,1,8)||[m.legend,m.labels,m.axes,m.markers].some(v=>typeof v!=='boolean'))return bad();
  if(m.categoryIds!==undefined&&(!Array.isArray(m.categoryIds)||m.categoryIds.length!==m.categories.length||new Set(m.categoryIds).size!==m.categoryIds.length||m.categoryIds.some(v=>!label(v)||!v)))return bad();
  const ids=new Set<string>();for(const s of m.series){if(!s||!keys(s,['id','name','color','values'])||!label(s.id)||!s.id||ids.has(s.id)||!label(s.name)||!color(s.color)||!Array.isArray(s.values)||s.values.length!==m.categories.length||s.values.some(v=>!finite(v,kind==='pie'?0:-1e12,1e12)))return bad();ids.add(s.id);}
  if(kind==='pie'&&!m.series[0].values.some(v=>v>0))return bad();
 }else if(m.type==='graph'){
  if(!['tree','hierarchy','flow'].includes(kind)||!keys(m,['version','type','nodes','edges','color'])||!color(m.color)||!Array.isArray(m.nodes)||!m.nodes.length||m.nodes.length>40||!Array.isArray(m.edges)||m.edges.length>80)return bad();
  const ids=new Set<string>();for(const n of m.nodes){if(!n||!keys(n,['id','label','x','y','shape','fill','color','textColor','collapsed'])||!label(n.id)||!n.id||ids.has(n.id)||!label(n.label)||!finite(n.x,0,4000)||!finite(n.y,0,4000)||!['box','decision','ellipse'].includes(n.shape))return bad();for(const key of ['fill','color','textColor'] as const)if(n[key]!==undefined&&!color(n[key]))return bad();if(n.collapsed!==undefined&&typeof n.collapsed!=='boolean')return bad();ids.add(n.id);}
  const edges=new Set<string>();for(const e of m.edges){if(!e||!keys(e,['id','from','to','label','color','dashed','style'])||!label(e.id)||!e.id||edges.has(e.id)||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||!label(e.label))return bad();if(e.color!==undefined&&!color(e.color)||e.dashed!==undefined&&typeof e.dashed!=='boolean'||e.style!==undefined&&!['straight','elbow'].includes(e.style))return bad();edges.add(e.id);}
 }else return bad();return m;
}
export function objectModel(kind:string,data:string,variant:string):ObjectModel{
 if(data.trim().startsWith('{'))return validateObjectModel(kind,JSON.parse(data));
 const rows=data.split('\n').filter(s=>s.trim()).map(s=>s.split('|').map(v=>v.trim()));
 if(['bar','line','pie'].includes(kind))return {version:1,type:'chart',categories:rows.map(r=>r[0]),palette:rows.map((_,i)=>chartColors[i%6]),series:[{id:'series-1',name:'Value',color:chartColors[0],values:rows.map(r=>Number(r[1]))}],legend:true,labels:true,axes:true,numberFormat:'number',lineWidth:3,markers:true};
 const horizontal=variant==='Left to right',byLabel=new Map(rows.map((r,i)=>[r[0],i]));
 const parents=rows.map((r,i)=>kind==='flow'?i-1:byLabel.get(r[1])??-1),levels=new Map<number,number>();
 const nodes=rows.map((r,i)=>{let depth=0,at=parents[i];const seen=new Set<number>();while(at>=0&&!seen.has(at)){seen.add(at);depth++;at=parents[at];}const slot=levels.get(depth)??0;levels.set(depth,slot+1);return {id:'node-'+i,label:r[0],x:horizontal?30+depth*190:30+slot*190,y:horizontal?30+slot*100:30+depth*120,shape:'box' as const};});
 return {version:1,type:'graph',nodes,edges:parents.flatMap((p,i)=>p>=0?[{id:'edge-'+i,from:nodes[p].id,to:nodes[i].id,label:''}]:[]),color:chartColors[0]};
}
export function autoLayout(model:GraphModel,horizontal:boolean):GraphModel{
 // Breadth-first levels; cycles remain finite and disconnected nodes stay visible.
 const depth=new Map<string,number>(),roots=model.nodes.filter(n=>!model.edges.some(e=>e.to===n.id));
 const queue=roots.length?roots.map(n=>n.id):[model.nodes[0].id];queue.forEach(id=>depth.set(id,0));
 for(let i=0;i<queue.length;i++)for(const edge of model.edges.filter(e=>e.from===queue[i]))if(!depth.has(edge.to)){depth.set(edge.to,(depth.get(edge.from)??0)+1);queue.push(edge.to);}
 const slots=new Map<number,number>();return {...model,nodes:model.nodes.map(n=>{const d=depth.get(n.id)??0,s=slots.get(d)??0;slots.set(d,s+1);return {...n,x:30+(horizontal?d:s)*190,y:30+(horizontal?s:d)*120};})};
}
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderObject(kind:string,model:ObjectModel,title:string,variant:string){
 const m=validateObjectModel(kind,model);let width=720,height=360,shapes='';
 if(m.type==='graph'){
  const hidden=new Set<string>();if(kind!=='flow')for(const n of m.nodes)if(n.collapsed){const seen=new Set([n.id]),queue=[n.id];for(let i=0;i<queue.length;i++)for(const e of m.edges)if(e.from===queue[i]&&!seen.has(e.to)){seen.add(e.to);hidden.add(e.to);queue.push(e.to);}}
  const visible=m.nodes.filter(n=>!hidden.has(n.id));
  width=Math.max(420,...visible.map(n=>n.x+180));height=Math.max(220,...visible.map(n=>n.y+100));const nodes=new Map(m.nodes.map(n=>[n.id,n]));
  for(const e of m.edges){if(hidden.has(e.from)||hidden.has(e.to))continue;const a=nodes.get(e.from)!,b=nodes.get(e.to)!,horizontal=variant==='Left to right',x1=a.x+(horizontal?150:75),y1=a.y+(horizontal?32:64),x2=b.x+(horizontal?0:75),y2=b.y+(horizontal?32:0);const dx=e.style==='elbow'?(horizontal?x2-(x1+x2)/2:0):x2-x1,dy=e.style==='elbow'?(horizontal?0:y2-(y1+y2)/2):y2-y1,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;const line=e.style==='elbow'?(horizontal?`M${x1} ${y1}H${(x1+x2)/2}V${y2}H${x2}`:`M${x1} ${y1}V${(y1+y2)/2}H${x2}V${y2}`):`M${x1} ${y1}L${x2} ${y2}`;shapes+=`<g data-edge-id="${esc(e.id)}" role="button" tabindex="0" aria-label="${esc(e.label||'Connection')}"><path d="${line}" stroke="transparent" stroke-width="14" fill="none" pointer-events="stroke"/><path d="${line}" stroke="${e.color??m.color}"${e.dashed?' stroke-dasharray="6 4"':''} stroke-width="2" fill="none"/><path d="M${x2-ux*10-uy*4} ${y2-uy*10+ux*4}L${x2} ${y2}L${x2-ux*10+uy*4} ${y2-uy*10-ux*4}" fill="none" stroke="${e.color??m.color}" stroke-width="2"/><text x="${(x1+x2)/2+6}" y="${(y1+y2)/2-6}">${esc(e.label)}</text></g>`;}
  for(const n of visible){const geometry=n.shape==='decision'?`<polygon points="75,0 150,32 75,64 0,32"/>`:n.shape==='ellipse'?'<ellipse cx="75" cy="32" rx="75" ry="32"/>':'<rect width="150" height="64" rx="8"/>';const words=n.label.match(/.{1,22}(?:\s|$)|.{1,22}/g)??[''];shapes+=`<g data-node-id="${esc(n.id)}" transform="translate(${n.x} ${n.y})" role="button" tabindex="0" aria-label="${esc(n.label)}"><g fill="${n.fill??'white'}" stroke="${n.color??m.color}" stroke-width="2">${geometry}</g><text fill="${n.textColor??'#334155'}" x="75" y="${32-(words.length-1)*7}" text-anchor="middle">${words.slice(0,4).map((w,i)=>`<tspan x="75" dy="${i?14:0}">${esc(w.trim())}</tspan>`).join('')}</text>${n.collapsed?'<text x="138" y="58" font-size="14">+</text>':''}<title>${esc(n.label)}</title></g>`;}
 }else{
  const series=m.series,format=(v:number)=>m.numberFormat==='currency'?'₹'+v.toLocaleString('en-IN'):m.numberFormat==='percent'?v+'%':v.toLocaleString('en-IN');
  const legend=m.legend?series.map((s,i)=>`<rect x="${55+i*110}" y="330" width="10" height="10" fill="${s.color}"/><text x="${70+i*110}" y="339">${esc(s.name)}</text>`).join(''):'';
  if(kind==='pie'){
   const values=series[0].values,total=values.reduce((a,b)=>a+b,0);let angle=-Math.PI/2;height=Math.max(360,m.categories.length*23+50);
   values.forEach((v,i)=>{const next=angle+v/total*Math.PI*2,c=m.palette[i];if(v===total)shapes+=`<circle data-category-id="${esc(m.categoryIds?.[i]??'category-'+i)}" cx="210" cy="170" r="125" fill="${c}"/>`;else if(v>0)shapes+=`<path data-category-id="${esc(m.categoryIds?.[i]??'category-'+i)}" d="M210 170L${210+125*Math.cos(angle)} ${170+125*Math.sin(angle)}A125 125 0 ${next-angle>Math.PI?1:0} 1 ${210+125*Math.cos(next)} ${170+125*Math.sin(next)}Z" fill="${c}"/>`;if(m.legend||m.labels)shapes+=`<rect x="370" y="${35+i*23}" width="10" height="10" fill="${c}"/><text x="388" y="${44+i*23}">${esc(m.legend?m.categories[i]:'')}${m.labels?' '+esc(format(v)):''}</text>`;angle=next;});if(variant==='Doughnut')shapes+='<circle cx="210" cy="170" r="68" fill="white"/>';
  }else{
   const values=series.flatMap(s=>s.values),min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1,horizontal=kind==='bar'&&variant==='Horizontal';if(horizontal)height=Math.max(360,m.categories.length*series.length*22+80);
   const x=(v:number)=>150+(v-min)/range*500,y=(v:number)=>285-(v-min)/range*245,zero=horizontal?x(0):y(0),step=horizontal?(height-85)/m.categories.length:610/m.categories.length;
   if(m.axes){for(let i=0;i<5;i++){const v=min+range*i/4;shapes+=horizontal?`<path d="M${x(v)} 20V${height-60}" stroke="#e2e8f0"/><text x="${x(v)}" y="${height-40}" text-anchor="middle">${esc(format(Math.round(v*100)/100))}</text>`:`<path d="M75 ${y(v)}H685" stroke="#e2e8f0"/><text x="65" y="${y(v)+4}" text-anchor="end">${esc(format(Math.round(v*100)/100))}</text>`;}}
   m.categories.forEach((c,i)=>{shapes+=horizontal?`<text x="140" y="${30+i*step+step/2}" text-anchor="end">${esc(c)}</text>`:`<text x="${75+i*step+step/2}" y="310" text-anchor="middle">${esc(c)}</text>`;});
   series.forEach((s,j)=>{if(kind==='line')shapes+=`<polyline points="${s.values.map((v,i)=>`${75+i*step+step/2},${y(v)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${m.lineWidth}"/>`;s.values.forEach((v,i)=>{const px=75+i*step+step/2,py=y(v),size=Math.max(2,(step-10)/series.length);if(kind==='bar')shapes+=horizontal?`<rect data-category-id="${esc(m.categoryIds?.[i]??'category-'+i)}" data-series-id="${esc(s.id)}" x="${Math.min(zero,x(v))}" y="${25+i*step+j*size}" width="${Math.max(1,Math.abs(x(v)-zero))}" height="${size-2}" fill="${s.color}"/>`:`<rect data-category-id="${esc(m.categoryIds?.[i]??'category-'+i)}" data-series-id="${esc(s.id)}" x="${75+i*step+5+j*size}" y="${Math.min(py,zero)}" width="${size-2}" height="${Math.max(1,Math.abs(py-zero))}" fill="${s.color}"/>`;else if(m.markers)shapes+=`<circle data-category-id="${esc(m.categoryIds?.[i]??'category-'+i)}" data-series-id="${esc(s.id)}" cx="${px}" cy="${py}" r="4" fill="${s.color}"/>`;if(m.labels)shapes+=horizontal?`<text x="${x(v)+5}" y="${25+i*step+j*size+size*.7}">${esc(format(v))}</text>`:`<text x="${kind==='bar'?75+i*step+5+j*size+size/2:px}" y="${py-7}" text-anchor="middle">${esc(format(v))}</text>`;});});shapes+=legend;
  }
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><g font-family="Arial,sans-serif" font-size="12" fill="#334155">${shapes}</g></svg>`;
}
