import {autoLayout,nodeSize,type ChartModel,type GraphModel,type DiagramEdge} from './chart-model';
export const categoryIds=(m:ChartModel)=>m.categoryIds??m.categories.map((_,i)=>'category-'+i);
export function reorderCategory(m:ChartModel,from:number,to:number):ChartModel{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=m.categories.length||to>=m.categories.length)throw Error('Choose an existing chart category.');
 const move=<T,>(values:T[])=>{const next=[...values],[item]=next.splice(from,1);next.splice(to,0,item);return next;};
 return {...m,categoryIds:move(categoryIds(m)),categories:move(m.categories),palette:move(m.palette),series:m.series.map(s=>({...s,values:move(s.values)}))};
}
export function graphBranch(m:GraphModel,id:string){const seen=new Set([id]),queue=[id];for(let i=0;i<queue.length;i++)for(const e of m.edges)if(e.from===queue[i]&&!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}return seen;}
export function moveGraphNode(m:GraphModel,id:string,x:number,y:number,branch=false):GraphModel{
 const n=m.nodes.find(n=>n.id===id);if(!n)throw Error('Choose an existing node.');if(n.locked)return m;const ids=branch?graphBranch(m,id):new Set([id]);if(m.nodes.some(n=>ids.has(n.id)&&n.locked))throw Error('Unlock the branch nodes before moving them.');const moving=m.nodes.filter(n=>ids.has(n.id));
 const dx=Math.max(-Math.min(...moving.map(n=>n.x)),Math.min(4000-Math.max(...moving.map(n=>n.x)),Math.round(x-n.x))),dy=Math.max(-Math.min(...moving.map(n=>n.y)),Math.min(4000-Math.max(...moving.map(n=>n.y)),Math.round(y-n.y)));
 return {...m,nodes:m.nodes.map(n=>ids.has(n.id)?{...n,x:n.x+dx,y:n.y+dy}:n)};
}
export function connectGraph(m:GraphModel,edge:DiagramEdge,kind:string):GraphModel{
 if(!m.nodes.some(n=>n.id===edge.from)||!m.nodes.some(n=>n.id===edge.to)||edge.from===edge.to)throw Error('Choose two different nodes.');
 const edges=m.edges.filter(e=>e.id!==edge.id),base={...m,edges};
 if(edges.some(e=>e.from===edge.from&&e.to===edge.to))throw Error('These nodes are already connected.');
 if(kind!=='flow'&&(edges.some(e=>e.to===edge.to)||graphBranch(base,edge.to).has(edge.from)))throw Error('A hierarchy node needs one parent and cannot create a cycle.');
 if(edges.length>=80)throw Error('Use up to 80 connections.');return {...m,edges:[...edges,edge]};
}
export function reparentGraph(m:GraphModel,id:string,parent:string,kind:string):GraphModel{
 const incoming=m.edges.find(e=>e.to===id),base={...m,edges:m.edges.filter(e=>e.to!==id)};if(!parent)return base;
 return connectGraph(base,{...(incoming??{id:crypto.randomUUID(),label:''}),from:parent,to:id},kind);
}
export function addGraphNode(m:GraphModel,anchorId:string,relationship:'child'|'sibling'|'parent'|'free',kind:string,id:string,edgeId:string):GraphModel{
 if(m.nodes.length>=40)throw Error('Use up to 40 nodes.');const anchor=m.nodes.find(n=>n.id===anchorId)??m.nodes[0];
 const occupied=(x:number,y:number)=>m.nodes.some(n=>x<n.x+nodeSize(n).width+24&&x+174>n.x&&y<n.y+nodeSize(n).height+24&&y+88>n.y);
 let x=Math.min(3800,anchor.x+(relationship==='child'?0:nodeSize(anchor).width+44)),y=Math.min(3900,anchor.y+(relationship==='child'?nodeSize(anchor).height+56:0));
 if(occupied(x,y)){let found=false;for(let distance=1;distance<28&&!found;distance++)for(let offset=0;offset<=distance&&!found;offset++){const px=Math.min(4000,Math.max(0,x+offset*190)),py=Math.min(4000,Math.max(0,y+(distance-offset)*120));if(!occupied(px,py)){x=px;y=py;found=true;}}if(!found)throw Error('Make room on the diagram before adding another node.');}
 let next:GraphModel={...m,nodes:[...m.nodes,{id,label:'New node',x,y,shape:'box'}]};
 if(relationship==='parent'){next={...next,edges:next.edges.map(e=>e.to===anchor.id?{...e,to:id}:e)};return connectGraph(next,{id:edgeId,from:id,to:anchor.id,label:''},kind);}
 const parent=relationship==='child'?anchor.id:relationship==='sibling'?m.edges.find(e=>e.to===anchor.id)?.from:null;
 if(parent){next={...next,nodes:next.nodes.map(n=>n.id===parent?{...n,collapsed:false}:n)};next=connectGraph(next,{id:edgeId,from:parent,to:id,label:''},kind);}return next;
}
export function deleteGraphNode(m:GraphModel,id:string,branch=false):GraphModel{
 const remove=branch?graphBranch(m,id):new Set([id]);if(m.nodes.every(n=>remove.has(n.id)))throw Error('Keep at least one node.');
 return {...m,nodes:m.nodes.filter(n=>!remove.has(n.id)),edges:m.edges.filter(e=>!remove.has(e.from)&&!remove.has(e.to))};
}
export function visibleGraph(m:GraphModel,kind:string){
 if(kind==='flow')return m;const hidden=new Set<string>();for(const n of m.nodes)if(n.collapsed)for(const id of graphBranch(m,n.id))if(id!==n.id)hidden.add(id);
 return {...m,nodes:m.nodes.filter(n=>!hidden.has(n.id)),edges:m.edges.filter(e=>!hidden.has(e.from)&&!hidden.has(e.to))};
}
export function boundedLayout(m:GraphModel,horizontal:boolean){
 if(m.nodes.some(n=>n.locked))throw Error('Unlock the elements before arranging this diagram.');
 const next=autoLayout(m,horizontal),sx=Math.max(190,...m.nodes.map(n=>nodeSize(n).width+40)),sy=Math.max(120,...m.nodes.map(n=>nodeSize(n).height+50)),columns=Math.max(1,Math.floor(3970/sx)+1);
 return next.nodes.some(n=>n.x>4000||n.y>4000)?{...next,nodes:next.nodes.map((n,i)=>({...n,x:30+i%columns*sx,y:30+Math.floor(i/columns)*sy}))}:next;
}

export function resizeGraphNode(m:GraphModel,id:string,width:number,height:number,x?:number,y?:number):GraphModel{
 return {...m,nodes:m.nodes.map(n=>n.id===id&&!n.locked?{...n,width:Math.round(Math.max(80,Math.min(600,width))),height:Math.round(Math.max(40,Math.min(400,height))),x:Math.round(Math.max(0,Math.min(4000,x??n.x))),y:Math.round(Math.max(0,Math.min(4000,y??n.y)))}:n)};
}
