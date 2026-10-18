import {autoLayout,type ChartModel,type GraphModel,type DiagramEdge} from './chart-model';
export const categoryIds=(m:ChartModel)=>m.categoryIds??m.categories.map((_,i)=>'category-'+i);
export function reorderCategory(m:ChartModel,from:number,to:number):ChartModel{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=m.categories.length||to>=m.categories.length)throw Error('Choose an existing chart category.');
 const move=<T,>(values:T[])=>{const next=[...values],[item]=next.splice(from,1);next.splice(to,0,item);return next;};
 return {...m,categoryIds:move(categoryIds(m)),categories:move(m.categories),palette:move(m.palette),series:m.series.map(s=>({...s,values:move(s.values)}))};
}
export function graphBranch(m:GraphModel,id:string){const seen=new Set([id]),queue=[id];for(let i=0;i<queue.length;i++)for(const e of m.edges)if(e.from===queue[i]&&!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}return seen;}
export function moveGraphNode(m:GraphModel,id:string,x:number,y:number,branch=false):GraphModel{
 const n=m.nodes.find(n=>n.id===id);if(!n)throw Error('Choose an existing node.');const ids=branch?graphBranch(m,id):new Set([id]),moving=m.nodes.filter(n=>ids.has(n.id));
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
 const occupied=(x:number,y:number)=>m.nodes.some(n=>Math.abs(n.x-x)<170&&Math.abs(n.y-y)<85);
 let x=Math.min(3800,anchor.x+190),y=anchor.y;for(let i=0;i<40&&occupied(x,y);i++){x=30+(i%10)*190;y=30+Math.floor(i/10)*120;}
 let next:GraphModel={...m,nodes:[...m.nodes,{id,label:'New node',x,y,shape:'box'}]};
 if(relationship==='parent'){next={...next,edges:next.edges.map(e=>e.to===anchor.id?{...e,to:id}:e)};return connectGraph(next,{id:edgeId,from:id,to:anchor.id,label:''},kind);}
 const parent=relationship==='child'?anchor.id:relationship==='sibling'?m.edges.find(e=>e.to===anchor.id)?.from:null;
 if(parent)next=connectGraph(next,{id:edgeId,from:parent,to:id,label:''},kind);return next;
}
export function deleteGraphNode(m:GraphModel,id:string,branch=false):GraphModel{
 const remove=branch?graphBranch(m,id):new Set([id]);if(m.nodes.every(n=>remove.has(n.id)))throw Error('Keep at least one node.');
 return {...m,nodes:m.nodes.filter(n=>!remove.has(n.id)),edges:m.edges.filter(e=>!remove.has(e.from)&&!remove.has(e.to))};
}
export function visibleGraph(m:GraphModel,kind:string){
 if(kind==='flow')return m;const hidden=new Set<string>();for(const n of m.nodes)if(n.collapsed)for(const id of graphBranch(m,n.id))if(id!==n.id)hidden.add(id);
 return {...m,nodes:m.nodes.filter(n=>!hidden.has(n.id)),edges:m.edges.filter(e=>!hidden.has(e.from)&&!hidden.has(e.to))};
}
export function boundedLayout(m:GraphModel,horizontal:boolean){const next=autoLayout(m,horizontal);return next.nodes.some(n=>n.x>4000||n.y>4000)?{...next,nodes:next.nodes.map((n,i)=>({...n,x:30+i%8*190,y:30+Math.floor(i/8)*120}))}:next;}
