import type {NoteNode} from './structured-document';
import {columnsOf,financialConfig,nodeText,isSimpleTable,recalculateTotals,type TotalFormula} from './financial-formats';
export type RowCalculation={version:1;columns?:string[];section?:string;rows?:{row:string;sign:1|-1}[]};
export const columnRoles=['particulars','reference','date','amount','analysis','number','percent','text'] as const;
export type ColumnRole=typeof columnRoles[number];
export function rowCalculation(value:unknown):RowCalculation{
 let c:RowCalculation;try{if(typeof value!=='string'||value.length>12000)throw Error();c=JSON.parse(value);}catch{throw Error('Invalid accounting total definition.');}
 const validId=(v:unknown)=>typeof v==='string'&&/^[-\w]{1,80}$/.test(v);
 if(!c||c.version!==1||Object.keys(c).some(k=>!['version','section','rows','columns'].includes(k))||c.columns!==undefined&&(!Array.isArray(c.columns)||!c.columns.length||c.columns.length>12||c.columns.some(id=>!validId(id)))||Boolean(c.section)===Boolean(c.rows)||c.section!==undefined&&!validId(c.section)||c.rows!==undefined&&(!Array.isArray(c.rows)||!c.rows.length||c.rows.length>80||c.rows.some(t=>!t||!validId(t.row)||![1,-1].includes(t.sign)||Object.keys(t).some(k=>!['row','sign'].includes(k)))))throw Error('Invalid accounting total definition.');return c;
}
export function setAccountingMode(table:NoteNode,assisted:boolean):NoteNode{
 const cfg={...financialConfig(table.attrs?.caFormat),autoTotals:assisted};
 const next={...table,attrs:{...table.attrs,caFormat:JSON.stringify(cfg)},content:table.content?.map((row,i)=>({...row,content:row.content?.map(cell=>{
  if(i===0)return cell;
  if(!assisted)return {...cell,attrs:{...cell.attrs,caFormula:null}};
  if(!row.attrs?.caTotal)return cell;
  const definition=rowCalculation(row.attrs.caTotal),column=String(cell.attrs?.caColId);if(cell.attrs?.caKind!=='amount'&&!(definition.columns?.includes(column)&&['number','percent'].includes(String(cell.attrs?.caKind))))return {...cell,attrs:{...cell.attrs,caFormula:null}};if(definition.columns&&!definition.columns.includes(column))return {...cell,attrs:{...cell.attrs,caFormula:null}};const formula:TotalFormula={version:1,terms:definition.rows?.map(t=>({...t,column}))??[],basis:definition.rows?.map(()=> '')??[],...(definition.section?{scope:{section:definition.section,column}}:{})};
  return {...cell,attrs:{...cell.attrs,caFormula:JSON.stringify(formula)}};
 })}))};return assisted?recalculateTotals(next):next;
}
export function roleForColumn(id:string,label:string,kind:string):ColumnRole{
 if(/particular|label|narration|description|account$|^asset$/i.test(id+' '+label))return 'particulars';
 if(/L\.F|J\.F|folio|\bnotes?\b|\bref\b|voucher|note number/i.test(id+' '+label))return 'reference';
 if(/date/i.test(id+' '+label))return 'date';return kind==='amount'?'amount':kind==='number'?'number':kind==='percent'?'percent':'text';
}
export function initialColumnWidths(columns:{id:string;label:string;kind:string;role?:ColumnRole}[],budget=800){
 const roles=columns.map(c=>c.role??roleForColumn(c.id,c.label,c.kind));
 if(columns.length===5&&roles.join(',')==='date,particulars,reference,amount,amount')return [.12,.47,.05,.18,.18].map(n=>Math.round(n*budget));
 const weights=roles.map(r=>r==='particulars'?4:r==='reference'?.45:r==='date'?.9:r==='text'?2:1.4),sum=weights.reduce((a,b)=>a+b,0);
 return weights.map((w,i)=>Math.max(roles[i]==='reference'?32:roles[i]==='particulars'?180:64,Math.round(w/sum*budget)));
}
export function accountingSections(table:NoteNode){const sections=new Map<string,string>();for(const row of table.content??[]){if(row.attrs?.caSection){const id=String(row.attrs.caSection);if(!sections.has(id)||row.attrs.caRole==='section')sections.set(id,nodeText(row.content?.find(c=>c.attrs?.caColRole==='particulars')??row.content?.[0]??{type:'paragraph'})||id);}}return [...sections].map(([id,label])=>({id,label}));}
export function insertAccountingColumn(table:NoteNode,index:number,id:string){
 if(!isSimpleTable(table))throw Error('Unmerge cells before adding a column.');const columns=columnsOf(table);if(columns.length>=12)throw Error('Use up to 12 columns per working.');
 const width=110;return {...table,content:table.content?.map((row,i)=>{const content=[...(row.content??[])];content.splice(Math.max(0,Math.min(content.length,index)),0,{type:i===0?'tableHeader':'tableCell',attrs:{colspan:1,rowspan:1,colwidth:[width],caColId:id,caKind:'amount',caColRole:'amount'},content:[{type:'paragraph',content:i===0?[{type:'text',text:'New amount'}]:[]}]});return {...row,content};})};
}
/** New semantic tables can grow section totals into an inserted amount column. */
export function refreshAccounting(table:NoteNode){const cfg=financialConfig(table.attrs?.caFormat);return cfg.workings&&cfg.autoTotals?setAccountingMode(table,true):table;}
