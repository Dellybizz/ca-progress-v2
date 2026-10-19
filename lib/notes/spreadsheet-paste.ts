import type {NoteNode} from './structured-document';
import {canonicalAmount,financialConfig,isSimpleTable,numberCell,reconfigureTable,columnsOf} from './financial-formats';
import {insertFinancialRow} from './financial-actions';
export function spreadsheetGrid(text:string):string[][]{
 if(text.length>120000)throw Error('Paste up to 200 rows and 12 columns at a time.');
 const rows:string[][]=[],row:string[]=[];let value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&(quoted||!value)){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c==='\t'||c==='\n'||c==='\r')){row.push(value);value='';if(c!=='\t'){rows.push(row.splice(0));if(c==='\r'&&text[i+1]==='\n')i++;}}else value+=c;}
 if(quoted)throw Error('The pasted spreadsheet contains an unfinished quoted cell.');if(value||row.length)rows.push([...row,value]);
 return checkedGrid(rows);
}
export function checkedGrid(rows:string[][]){
 const width=Math.max(0,...rows.map(r=>r.length));if(!rows.length||rows.length>200||!width||width>12||rows.some(r=>r.some(v=>v.length>2000||v.includes('\0'))))throw Error('Paste up to 200 rows, 12 columns and 2,000 characters per cell.');
 return rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''));
}
const paragraph=(text:string):NoteNode=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
export function gridTable(grid:string[][]):NoteNode{return {type:'table',content:checkedGrid(grid).map(row=>({type:'tableRow',content:row.map(text=>({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null},content:[paragraph(text)]}))}))};}
export function pasteTableGrid(original:NoteNode,row:number,column:number,grid:string[][]):NoteNode{
 grid=checkedGrid(grid);if(!isSimpleTable(original))throw Error('Unmerge target cells before pasting a spreadsheet.');if(row<0||column<0||!Number.isInteger(row)||!Number.isInteger(column))throw Error('Select a destination cell.');
 const financial=!!original.attrs?.caFormat,maxRows=financial?201:200,width=column+grid[0].length,height=row+grid.length;if(width>12||height>maxRows)throw Error('This paste exceeds the table limit. Use up to 200 line items and 12 columns.');
 let table=structuredClone(original),cols=table.content![0].content!.length;
 if(financial){const cfg=financialConfig(table.attrs!.caFormat);if(width>cols){const columns=columnsOf(table);while(columns.length<width)columns.push({id:'col-'+crypto.randomUUID(),label:'Column '+(columns.length+1),kind:'text'});table=reconfigureTable(table,cfg,columns);cols=width;}while(table.content!.length<height)table=insertFinancialRow(table,table.content!.length-1,'item','row-'+crypto.randomUUID());}
 else{cols=Math.max(cols,width);for(const r of table.content!)while(r.content!.length<cols)r.content!.push({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null},content:[paragraph('')]});while(table.content!.length<height)table.content!.push({type:'tableRow',content:Array.from({length:cols},()=>({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null},content:[paragraph('')]}))});}
 const cfg=financial?financialConfig(table.attrs!.caFormat):null,manualRows=new Set<number>();
 for(let i=0;i<grid.length;i++)for(let j=0;j<grid[i].length;j++){const r=row+i,c=column+j,cell=table.content![r].content![c],text=grid[i][j];if(cfg?.workings&&r>0&&table.content![r].attrs?.caTotal&&['amount','number','percent'].includes(String(cell.attrs?.caKind)))manualRows.add(r);let next:NoteNode={...cell,attrs:{...cell.attrs,caRaw:null,caFormula:null},content:[paragraph(text)]};if(cfg&&r>0&&['amount','number','percent'].includes(String(cell.attrs?.caKind))&&text.trim()){const raw=canonicalAmount(text);if(raw===null)throw Error(`Row ${i+1}, column ${j+1} needs a number. Spreadsheet formulas must be calculated before pasting.`);next=numberCell(next,raw,cfg);}table.content![r].content![c]=next;}
 for(const index of manualRows){const row=table.content![index];table.content![index]={...row,attrs:{...row.attrs,caTotal:null},content:row.content?.map(cell=>({...cell,attrs:{...cell.attrs,caFormula:null}}))};}
 return table;
}
