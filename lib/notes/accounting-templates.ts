import type {NoteNode} from './structured-document';
import {columnsOf,financialConfig} from './financial-formats';
import {initialColumnWidths,roleForColumn,type RowCalculation} from './accounting-semantics';
const p=(text:string):NoteNode=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
export function prepareAccounting(table:NoteNode,stock:boolean):NoteNode{
 const cfg=financialConfig(table.attrs?.caFormat),columns=columnsOf(table).map(c=>({...c,role:roleForColumn(c.id,c.label,c.kind)})),widths=initialColumnWidths(columns);
 let next:NoteNode={...table,attrs:{...table.attrs,caFormat:JSON.stringify({...cfg,workings:1,autoTotals:false})},content:table.content?.map((r,i)=>({...r,attrs:{...r.attrs,...(i?{caRole:'item'}:{})},content:r.content?.map((c,j)=>({...c,attrs:{...c.attrs,colwidth:[widths[j]],caColRole:columns[j].role}}))}))};
 if(!stock)return next;
 const rows=next.content!,set=(i:number,role:string,section?:string,total?:RowCalculation)=>{if(rows[i])rows[i]={...rows[i],attrs:{...rows[i].attrs,caRole:role,...(section?{caSection:section}:{}),...(total?{caTotal:JSON.stringify(total)}:{})}};};
 if(cfg.formatId==='profit'&&cfg.variant!=='T-account'){
  set(1,'item','income');set(2,'item','income');set(3,'subtotal',undefined,{version:1,section:'income'});
  for(let i=4;i<=9;i++)set(i,'item','expenses');
  // Add an explicit expenses total so net results reference groups rather than double-counting detail.
  const template=rows[3],expenseTotal={...template,attrs:{...template.attrs,caRowId:'total-expenses',caTotal:JSON.stringify({version:1,section:'expenses'})},content:template.content?.map((c,j)=>({...c,content:[p(j===0?'Total expenses':'')]}))};rows.splice(10,0,expenseTotal);
  set(11,'subtotal',undefined,{version:1,rows:[{row:String(rows[3].attrs?.caRowId),sign:1},{row:'total-expenses',sign:-1}]});set(12,'item','tax');set(13,'subtotal',undefined,{version:1,rows:[{row:String(rows[11].attrs?.caRowId),sign:1},{row:String(rows[12].attrs?.caRowId),sign:-1}]});
 }else if(cfg.formatId==='balance'&&cfg.variant!=='Horizontal'){
  set(1,'section','liabilities');for(let i=2;i<=5;i++)set(i,'item','liabilities');set(6,'subtotal',undefined,{version:1,section:'liabilities'});set(7,'section','assets');set(8,'item','assets');set(9,'item','assets');set(10,'subtotal',undefined,{version:1,section:'assets'});
 }else if(cfg.formatId==='journal'){
  for(let i=1;i<rows.length;i++)set(i,'item','entries');
 }
 next={...next,content:rows};return next;
}
/** Each side is a real writing table with its own rows, columns and total scope. */
export function independentAccount(table:NoteNode,stock:boolean,owner:string):NoteNode{
 const cfg=financialConfig(table.attrs?.caFormat),cols=columnsOf(table),split=cols.findIndex(c=>c.id==='right-label'||c.id==='right-date');if(split<1)throw Error('Choose a paired account layout.');
 const sides=[cols.slice(0,split),cols.slice(split)];
 return {type:'account',attrs:{blockId:owner},content:sides.map((side,index)=>{
  const selected=new Set(side.map(c=>c.id)),sideCfg={...cfg,workings:1 as const,autoTotals:false},widths=initialColumnWidths(side,480);
  let rows:NoteNode[]=(table.content??[]).map((r,i)=>({...r,attrs:{...r.attrs,...(i?{caRole:'item',caSection:'entries'}:{})},content:r.content?.filter(c=>selected.has(String(c.attrs?.caColId))).map((c,j)=>({...c,attrs:{...c.attrs,colwidth:[widths[j]],caColRole:roleForColumn(side[j].id,side[j].label,side[j].kind)}}))}));
  if(stock&&cfg.formatId==='ledger'){
   rows=rows.slice(0,-1);const row=(id:string,label:string,role:string,total?:RowCalculation):NoteNode=>({type:'tableRow',attrs:{caRowId:id,caRole:role,...(total?{caTotal:JSON.stringify(total)}:{})},content:side.map((c,j)=>({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:[widths[j]],caColId:c.id,caKind:c.kind,caColRole:roleForColumn(c.id,c.label,c.kind)},content:[p(c.id.includes('label')?label:'')]}))});
   rows.push(row('side-total','Total','subtotal',{version:1,section:'entries'}),row('balance-bd','Balance b/d','working'));
  }else if(stock&&cfg.formatId==='profit'){const base=rows[rows.length-1];rows.push({...base,attrs:{caRowId:'side-total',caRole:'subtotal',caTotal:JSON.stringify({version:1,section:'entries'})},content:base.content?.map(c=>({...c,attrs:{...c.attrs,caRaw:null,caFormula:null},content:[p(String(c.attrs?.caColId).includes('label')?'Total':'')]}))});}else if(stock){if(rows[1])rows[1]={...rows[1],attrs:{...rows[1].attrs,caRole:'section'}};for(let i=1;i<rows.length;i++){const last=i===rows.length-1;if(last)rows[i]={...rows[i],attrs:{...rows[i].attrs,caSection:null,caRole:'subtotal',caTotal:JSON.stringify({version:1,section:'entries'})}};}}
  return {type:'table',attrs:{blockId:'block-'+crypto.randomUUID(),caFormat:JSON.stringify(sideCfg),caStale:false},content:rows.map((r,i)=>i===0?{...r,content:r.content?.map((c,j)=>j===0?{...c,content:[p((index?'Cr. · ':'Dr. · ')+side[j].label)]}:c)}:r)};
 })};
}
