import type {NoteNode} from './structured-document';
import {addTotal,columnsOf,financialConfig,isSimpleTable,reconfigureTable,totalFormula} from './financial-formats';
const para=(text=''):NoteNode=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
function simple(table:NoteNode){if(!isSimpleTable(table))throw Error('Unmerge cells before changing row or column order.');}
export function moveFinancialRow(table:NoteNode,from:number,to:number):NoteNode{
 simple(table);const rows=[...(table.content??[])];if(from<1||to<1||from>=rows.length||to>=rows.length)throw Error('Keep the header first and choose an existing line item.');
 const [row]=rows.splice(from,1);rows.splice(to,0,row);return {...table,content:rows};
}
export function moveFinancialColumn(table:NoteNode,from:number,to:number):NoteNode{
 simple(table);const columns=columnsOf(table);if(from<0||to<0||from>=columns.length||to>=columns.length)throw Error('Choose an existing column.');
 const [column]=columns.splice(from,1);columns.splice(to,0,column);return reconfigureTable(table,financialConfig(table.attrs?.caFormat),columns);
}
export function insertFinancialRow(table:NoteNode,after:number,role:'item'|'section'|'working',rowId:string):NoteNode{
 simple(table);if((table.content?.length??0)>=201)throw Error('Use up to 200 line items per working.');
 const cols=columnsOf(table),label=cols.find(c=>['particulars','left-label'].includes(c.id))??cols.find(c=>c.kind==='text')??cols[0];
 const target=table.content?.[after+1],previous=table.content?.[after];let section=previous?.attrs?.caTotal?null:previous?.attrs?.caSection??null;
 if(target?.attrs?.caTotal){const total=JSON.parse(String(target.attrs.caTotal));if(total.section)section=total.section;}
 if(role==='section')section='section-'+crypto.randomUUID();if(role==='working')section=null;
 const row:NoteNode={type:'tableRow',attrs:{caRowId:rowId,caRole:role,...(section?{caSection:section}:{})},content:cols.map(col=>({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:table.content?.[0]?.content?.find(c=>c.attrs?.caColId===col.id)?.attrs?.colwidth??null,caColId:col.id,caKind:col.kind,...(col.role?{caColRole:col.role}:{})},content:[para(col.id===label.id?(role==='section'?'New section':role==='working'?'Working note':''):'')]}))};
 const rows=[...(table.content??[])];rows.splice(Math.max(1,Math.min(rows.length,after+1)),0,row);return {...table,content:rows};
}
export function upsertFinancialTotal(table:NoteNode,terms:{row:string;sign:1|-1}[],columnIds:string[],label:string,rowId:string,after?:number):NoteNode{
 simple(table);const index=table.content?.findIndex(r=>r.attrs?.caRowId===rowId)??-1,prior=index>=0?table.content![index]:null;
 if(index<0&&(table.content?.length??0)>=201)throw Error('Use up to 200 line items per working.');
 const base={...table,content:table.content?.filter(r=>r.attrs?.caRowId!==rowId)};
 const calculated=addTotal(base,terms,columnIds,label,rowId),row=calculated.content!.at(-1)!;
 const labelColumn=columnsOf(table).find(c=>['particulars','left-label'].includes(c.id))??columnsOf(table).find(c=>c.kind==='text');
 const next={...row,attrs:{...(prior?.attrs??{}),...row.attrs,caRole:'subtotal',...(financialConfig(table.attrs?.caFormat).workings?{caSection:null,caTotal:JSON.stringify({version:1,rows:terms,columns:columnIds})}:{})},content:row.content?.map(c=>{const old=prior?.content?.find(p=>p.attrs?.caColId===c.attrs?.caColId);if(old&&c.attrs?.caColId!==labelColumn?.id&&!columnIds.includes(String(c.attrs?.caColId)))return {...old,attrs:{...old.attrs,caFormula:null}};return {...c,attrs:{...c.attrs,...(old?.attrs?.colwidth?{colwidth:old.attrs.colwidth}:{}),...(old?.attrs?.caFill?{caFill:old.attrs.caFill}:{}),...(old?.attrs?.caBorder?{caBorder:old.attrs.caBorder}:{})},content:c.content?.map(p=>({...p,...(old?.content?.[0]?.attrs?{attrs:old.content[0].attrs}:{}),content:p.content?.map(t=>({...t,...(old?.content?.[0]?.content?.[0]?.marks?{marks:old.content[0].content[0].marks}:{})}))}))};})};
 const rows=calculated.content!.slice(0,-1);rows.splice(index>=0?index:Math.min(rows.length,(after??rows.length-1)+1),0,next);return {...calculated,content:rows};
}
export function financialTotalSources(row:NoteNode){const cell=row.content?.find(c=>c.attrs?.caFormula);return cell?totalFormula(cell.attrs!.caFormula):null;}
