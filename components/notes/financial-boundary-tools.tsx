 'use client';
/** Page-independent controls: resizing and zooming a table never resize its toolbar. */
export function FinancialBoundaryTools({row,column,rowLimit,columnLimit,onRow,onColumn}:{row:number;column:number;rowLimit:boolean;columnLimit:boolean;onRow:(after:number)=>void;onColumn:(index:number)=>void}){
 const button=(label:string,action:()=>void,disabled=false)=><button type="button" aria-label={label} title={label} disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={action}>{label}</button>;
 return <div className="note-financial-boundaries" aria-label="Insert rows and columns"><span>Row {row+1}</span>{button('＋ Above',()=>onRow(row-1),row===0||rowLimit)}{button('＋ Below',()=>onRow(row),rowLimit)}<span>Col {column+1}</span>{button('＋ Before',()=>onColumn(column),columnLimit)}{button('＋ After',()=>onColumn(column+1),columnLimit)}</div>;
}
