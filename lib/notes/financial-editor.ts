'use client';
import {TableView} from '@tiptap/extension-table';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {Extension} from '@tiptap/core';
import type {Editor} from '@tiptap/react';
import {Plugin,TextSelection} from '@tiptap/pm/state';
import {closeHistory} from '@tiptap/pm/history';
import {financialConfig,displayAmount,canonicalAmount,rawAmount,numberCell,isSimpleTable,totalsStale,type FinancialConfig} from './financial-formats';
import type {NoteNode} from './structured-document';
export function selectedFinancialTable(editor:Editor){
 const {$from}=editor.state.selection;for(let depth=$from.depth;depth>0;depth--)if($from.node(depth).type.name==='table')return {node:$from.node(depth),pos:$from.before(depth),depth};
 const node=editor.state.doc.nodeAt(editor.state.selection.from);return node?.type.name==='table'?{node,pos:editor.state.selection.from,depth:$from.depth+1}:null;
}
export function replaceFinancialTable(editor:Editor,pos:number,table:NoteNode,cfg?:FinancialConfig){
 let selectedRow='',selectedColumn='';const from=editor.state.selection.$from;for(let d=from.depth;d>0;d--){if(from.node(d).type.name==='tableRow')selectedRow=from.node(d).attrs.caRowId;if(['tableCell','tableHeader'].includes(from.node(d).type.name))selectedColumn=from.node(d).attrs.caColId;}
 const current=editor.state.doc.nodeAt(pos);if(current?.type.name!=='table')throw Error('This table has moved. Reopen its settings.');let tr=closeHistory(editor.state.tr).replaceWith(pos,pos+current.nodeSize,editor.schema.nodeFromJSON(table));
 if(cfg){const owner=current.attrs.blockId;editor.state.doc.descendants((n,at)=>{if(n.attrs.caOwner!==owner||!owner||!['title','subtitle'].includes(n.attrs.caCaption))return;const value=n.attrs.caCaption==='title'?cfg.title:[cfg.variant,...cfg.periods,cfg.currency].filter(Boolean).join(' · ');const mapped=tr.mapping.map(at);tr=tr.replaceWith(mapped,mapped+n.nodeSize,n.type.create(n.attrs,value?editor.schema.text(value):undefined));});}
 const at=tr.mapping.map(pos,-1);let caret=at+2;tr.doc.nodeAt(at)?.forEach((row,rowOffset)=>{if(row.attrs.caRowId===selectedRow)row.forEach((cell,offset)=>{if(cell.attrs.caColId===selectedColumn)caret=at+rowOffset+offset+4;});});tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size,caret))));editor.view.dispatch(tr);
}
function focusedAmount(state:Editor['state']){const {$from}=state.selection;let cellPos=-1,cfg:FinancialConfig|undefined;for(let d=$from.depth;d>0;d--){const n=$from.node(d);if(n.type.name==='tableCell'&&$from.index(d-2)>0)cellPos=$from.before(d);if(n.type.name==='table'&&n.attrs.caFormat){try{cfg=financialConfig(n.attrs.caFormat);}catch{}}}return cfg&&cellPos>=0?{pos:cellPos,cfg}:null;}
export function flushFinancialCell(editor:Editor){editor.view.dispatch(editor.state.tr.setMeta('ca-format-blur',true));}
const read=(attr:string)=>(el:HTMLElement)=>el.getAttribute('data-'+attr);
const attr=(name:string,render?:(a:Record<string,unknown>)=>Record<string,string|undefined>)=>({default:null,parseHTML:read(name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())),renderHTML:render??((a:Record<string,unknown>)=>a[name]?{['data-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]:String(a[name])}:{})});
export const FinancialTables=Extension.create({name:'financialTables',addGlobalAttributes(){return [
 {types:['table'],attributes:{caFormat:attr('caFormat',a=>{if(!a.caFormat)return {};try{const c=financialConfig(a.caFormat);return {'data-ca-format':String(a.caFormat),'data-ca-borders':c.borders,'data-ca-density':c.density,class:'note-financial-table'};}catch{return {};}}),caStale:{default:false,parseHTML:(el:HTMLElement)=>el.getAttribute('data-ca-stale')==='true',renderHTML:(a:Record<string,unknown>)=>a.caStale?{'data-ca-stale':'true'}:{}}}},
 {types:['tableRow'],attributes:{caRowId:attr('caRowId')}},
 {types:['tableCell','tableHeader'],attributes:{caColId:attr('caColId'),caKind:attr('caKind',a=>a.caKind?{'data-ca-kind':String(a.caKind)}:{}),caRaw:attr('caRaw'),caFormula:attr('caFormula')}},
 {types:['heading','paragraph'],attributes:{caOwner:attr('caOwner'),caCaption:attr('caCaption')}}
 ];},addProseMirrorPlugins(){return [new Plugin({props:{handleDOMEvents:{blur(view){view.dispatch(view.state.tr.setMeta('ca-format-blur',true));return false;}}},appendTransaction(transactions,old,state){const tr=state.tr,previous=focusedAmount(old),current=focusedAmount(state),blur=transactions.some(t=>t.getMeta('ca-format-blur'));if(previous&&(blur||previous.pos!==current?.pos)){let at=previous.pos;for(const transaction of transactions)at=transaction.mapping.map(at);const cell=tr.doc.nodeAt(at);if(cell?.type.name==='tableCell'&&['amount','number','percent'].includes(cell.attrs.caKind)){const raw=rawAmount(cell.toJSON(),previous.cfg.number);if(raw!==null&&raw!==''){const next=state.schema.nodeFromJSON(numberCell(cell.toJSON(),raw,previous.cfg));if(!cell.eq(next))tr.replaceWith(at,at+cell.nodeSize,next);}}}if(!tr.docChanged&&!transactions.some(t=>t.docChanged))return;
 tr.doc.descendants((table,pos,parent,index)=>{if(table.type.name!=='table'||!table.attrs.caFormat)return;let cfg:FinancialConfig;try{cfg=financialConfig(table.attrs.caFormat);}catch{return false;}
 const json=table.toJSON() as NoteNode;if(!isSimpleTable(json))return false;const seenCols=new Set<string>(),cols:{id:string;kind:string}[]=[],rows=new Set<string>();
 table.child(0).forEach((c)=>{let id=c.attrs.caColId;if(!id||seenCols.has(id))id='col-'+crypto.randomUUID();seenCols.add(id);cols.push({id,kind:c.attrs.caKind??'text'});});
 table.forEach((row,rowOffset)=>{let rowId=row.attrs.caRowId;if(!rowId||rows.has(rowId))rowId='row-'+crypto.randomUUID();rows.add(rowId);if(rowId!==row.attrs.caRowId)tr.setNodeMarkup(pos+1+rowOffset,undefined,{...row.attrs,caRowId:rowId});row.forEach((cell,offset,j)=>{const attrs:Record<string,unknown>={...cell.attrs,caColId:cols[j].id,caKind:cols[j].kind};if(attrs.caRaw&&(canonicalAmount(String(attrs.caRaw))!==attrs.caRaw||displayAmount(String(attrs.caRaw),cfg.number,String(attrs.caKind))!==cell.textContent.trim())){attrs.caRaw=null;if(attrs.caFormula)attrs.caFormula=null;}if(JSON.stringify(attrs)!==JSON.stringify(cell.attrs))tr.setNodeMarkup(pos+2+rowOffset+offset,undefined,attrs);});});
 const live=tr.doc.nodeAt(pos)!.toJSON() as NoteNode,stale=totalsStale(live);if(stale!==table.attrs.caStale)tr.setNodeMarkup(pos,undefined,{...table.attrs,caStale:stale});
 if(parent&&index>=2){const heading=parent.child(index-2),sub=parent.child(index-1);if(heading.attrs.caCaption==='title'&&sub.attrs.caCaption==='subtitle'){const owner=tr.doc.nodeAt(pos)!.attrs.blockId;let before=pos-sub.nodeSize;if(sub.attrs.caOwner!==owner)tr.setNodeMarkup(before,undefined,{...sub.attrs,caOwner:owner});before-=heading.nodeSize;if(heading.attrs.caOwner!==owner)tr.setNodeMarkup(before,undefined,{...heading.attrs,caOwner:owner});}}
 return false;});return tr.docChanged?tr:null;}})];}});

/** Keep Tiptap's native column sizing while applying per-document format attributes. */
export class FinancialTableView extends TableView{
 constructor(...args:ConstructorParameters<typeof TableView>){super(...args);this.syncFormat();}
 syncFormat(){if(this.node.attrs.blockId)this.table.id=this.node.attrs.blockId;const data=this.node.attrs.caFormat;this.table.classList.toggle('note-financial-table',!!data);for(const key of ['data-ca-format','data-ca-borders','data-ca-density','data-ca-stale'])this.table.removeAttribute(key);if(!data)return;try{const c=financialConfig(data);this.table.setAttribute('data-ca-format',data);this.table.setAttribute('data-ca-borders',c.borders);this.table.setAttribute('data-ca-density',c.density);if(this.node.attrs.caStale)this.table.setAttribute('data-ca-stale','true');}catch{}}
 update(node:ProseMirrorNode){if(!super.update(node))return false;this.syncFormat();return true;}
}
