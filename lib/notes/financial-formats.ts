import type {NoteNode} from './structured-document';
export type NumberStyle={grouping:'indian'|'western'|'none';decimals:number;negative:'minus'|'brackets';zero:'number'|'dash'};
export type FinancialConfig={version:1;formatId:string;title:string;variant:string;currency:string;periods:string[];number:NumberStyle;borders:'grid'|'horizontal'|'minimal';density:'compact'|'comfortable';autoTotals?:boolean;workings?:1};
export type FinancialColumn={id:string;label:string;kind:'text'|'amount'|'number'|'percent';role?:import('./accounting-semantics').ColumnRole};
export type TotalFormula={version:1;terms:{row:string;column:string;sign:1|-1}[];basis:string[];scope?:{section:string;column:string}};
export const DEFAULT_NUMBERS:NumberStyle={grouping:'indian',decimals:2,negative:'brackets',zero:'dash'};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max=160):v is string=>typeof v==='string'&&v.length<=max;
const id=(v:unknown):v is string=>str(v,80)&&/^[\w-]+$/.test(v);
const exact=(v:object,names:string[])=>Object.keys(v).every(k=>names.includes(k));
const bad=():never=>{throw Error('Invalid CA format configuration. Your existing working has been retained.');};
export function financialConfig(value:unknown):FinancialConfig{
 if(typeof value!=='string'||value.length>6000)bad();let c:FinancialConfig;try{c=JSON.parse(value as string);}catch{return bad();}
 if(!obj(c)||!exact(c,['version','formatId','title','variant','currency','periods','number','borders','density','autoTotals','workings'])||c.version!==1||!id(c.formatId)||!str(c.title)||!str(c.variant,80)||!['₹','Rs.','$','£',''].includes(c.currency)||!Array.isArray(c.periods)||c.periods.length>4||c.periods.some(p=>!str(p,80))||!['grid','horizontal','minimal'].includes(c.borders)||!['compact','comfortable'].includes(c.density))bad();
 if(c.workings!==undefined&&c.workings!==1)bad();
 if(c.autoTotals!==undefined&&typeof c.autoTotals!=='boolean')bad();
 const n=c.number;if(!obj(n)||!exact(n,['grouping','decimals','negative','zero'])||!['indian','western','none'].includes(n.grouping)||!Number.isInteger(n.decimals)||n.decimals<0||n.decimals>6||!['minus','brackets'].includes(n.negative)||!['number','dash'].includes(n.zero))bad();return c;
}
export function totalFormula(value:unknown):TotalFormula{
 if(typeof value!=='string'||value.length>40000)bad();let f:TotalFormula;try{f=JSON.parse(value as string);}catch{return bad();}
 if(!obj(f)||!exact(f,['version','terms','basis','scope'])||f.version!==1||!Array.isArray(f.terms)||(!f.terms.length&&!f.scope)||f.terms.length>200||!Array.isArray(f.basis)||f.basis.length!==f.terms.length||f.basis.some(x=>typeof x!=='string'||x!==''&&canonicalAmount(x)!==x))bad();
 if(f.scope&&(!obj(f.scope)||!exact(f.scope,['section','column'])||!id(f.scope.section)||!id(f.scope.column)))bad();
 for(const t of f.terms)if(!obj(t)||!exact(t,['row','column','sign'])||!id(t.row)||!id(t.column)||![1,-1].includes(t.sign))bad();return f;
}
export function nodeText(n:NoteNode):string{return n.text??(n.content??[]).map(nodeText).join(n.type==='tableCell'||n.type==='tableHeader'?'\n':'');}
/** Exact decimal parsing; never infer a number from narration or evaluate expressions. */
export function canonicalAmount(value:string):string|null{
 let s=value.trim().replace(/^(₹|Rs\.?|\$|£)\s*/,'');if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1).trim();s=s.replace(/%$/,'');
 if(s.includes(',')){const signed=s.startsWith('-')?s.slice(1):s,integer=signed.split('.')[0];if(!/^\d{1,3}(,\d{3})+$/.test(integer)&&!/^\d{1,2}(,\d{2})*,\d{3}$/.test(integer))return null;s=s.replaceAll(',','');}
 if(!/^-?\d{1,16}(\.\d{1,6})?$/.test(s))return null;const [whole,fraction='']=s.split('.');const negative=whole.startsWith('-'),digits=whole.replace('-','').replace(/^0+(?=\d)/,'');const f=fraction.replace(/0+$/,'');const out=(negative&&(digits!=='0'||f)?'-':'')+digits+(f?'.'+f:'');if(scaled(out)>1000000000000000000000n||scaled(out)<-1000000000000000000000n)return null;return out;
}
function scaled(s:string){const negative=s.startsWith('-'),[a,b='']=s.replace('-','').split('.');const n=BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));return negative?-n:n;}
function unscaled(n:bigint){const sign=n<0n?'-':'',a=(n<0n?-n:n).toString().padStart(7,'0'),f=a.slice(-6).replace(/0+$/,'');return sign+a.slice(0,-6)+(f?'.'+f:'');}
export function displayAmount(raw:string,style:NumberStyle,kind='amount'){
 const n=scaled(raw),negative=n<0n,absolute=negative?-n:n,unit=10n**BigInt(6-style.decimals),rounded=(absolute+unit/2n)/unit,digits=rounded.toString().padStart(style.decimals+1,'0');let whole=style.decimals?digits.slice(0,-style.decimals):digits;
 if(style.grouping==='western')whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');else if(style.grouping==='indian'&&whole.length>3)whole=whole.slice(0,-3).replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+whole.slice(-3);
 if(n===0n&&style.zero==='dash')return '—';const value=whole+(style.decimals?'.'+digits.slice(-style.decimals):'')+(kind==='percent'?'%':'');return negative&&rounded!==0n?(style.negative==='brackets'?'('+value+')':'-'+value):value;
}
export function rawAmount(cell:NoteNode,style:NumberStyle):string|null{
 const text=nodeText(cell).trim(),raw=cell.attrs?.caRaw,kind=String(cell.attrs?.caKind??'amount');if(typeof raw==='string'&&canonicalAmount(raw)===raw&&displayAmount(raw,style,kind)===text)return raw;return text===''?'':canonicalAmount(text);
}
export function columnsOf(table:NoteNode):FinancialColumn[]{return (table.content?.[0]?.content??[]).map((cell,i)=>({id:String(cell.attrs?.caColId??'col-'+i),label:nodeText(cell),kind:(cell.attrs?.caKind??'text') as FinancialColumn['kind'],...(cell.attrs?.caColRole?{role:cell.attrs.caColRole as FinancialColumn['role']}:{})}));}
export function isSimpleTable(table:NoteNode){const cols=table.content?.[0]?.content?.length??0;return cols>0&&cols<=12&&(table.content??[]).every(r=>r.content?.length===cols&&r.content.every(c=>(Number(c.attrs?.colspan)||1)===1&&(Number(c.attrs?.rowspan)||1)===1));}
const paragraph=(text:string,marks?:NoteNode[]):NoteNode=>({type:'paragraph',content:text?[{type:'text',text,...(marks?.length?{marks}:{})}]:[]});
export function numberCell(cell:NoteNode,raw:string,cfg:FinancialConfig):NoteNode{return {...cell,attrs:{...cell.attrs,caRaw:raw,textAlign:'right'},content:[{...(cell.content?.[0]??{type:'paragraph'}),content:paragraph(displayAmount(raw,cfg.number,String(cell.attrs?.caKind??'amount')),cell.content?.[0]?.content?.[0]?.marks).content}]};}
export function styledTable(table:NoteNode,next:FinancialConfig):NoteNode{
 const old=table.attrs?.caFormat?financialConfig(table.attrs.caFormat):next;
 return {...table,attrs:{...table.attrs,caFormat:JSON.stringify(next)},content:table.content?.map((row,i)=>i===0?row:{...row,content:row.content?.map(cell=>{if(!['amount','number','percent'].includes(String(cell.attrs?.caKind)))return cell;const raw=rawAmount(cell,old.number);return raw===null||raw===''?cell:numberCell(cell,raw,next);})})};
}
export function formulaValues(table:NoteNode,formula:TotalFormula,visiting=new Set<string>(),cache=new Map<string,{raw:string;basis:string[]}>()):{raw:string;basis:string[]}{
 if(visiting.size>80)throw Error('Split deeply nested totals into smaller workings.');
 const cfg=financialConfig(table.attrs?.caFormat);let sum=0n;const basis:string[]=[];
 for(const term of formulaTerms(table,formula)){const key=term.row+':'+term.column;if(visiting.has(key))throw Error('A total cannot contain a circular reference.');const row=table.content?.find(r=>r.attrs?.caRowId===term.row),cell=row?.content?.find(c=>c.attrs?.caColId===term.column);if(!cell)throw Error('A total refers to a removed row or column. Edit its sources or delete that total.');let raw:string|null;
  if(cell.attrs?.caFormula){const next=new Set(visiting);next.add(key);let result=cache.get(key);if(!result){result=formulaValues(table,totalFormula(cell.attrs.caFormula),next,cache);cache.set(key,result);}raw=result.raw;}else raw=rawAmount(cell,cfg.number);
  if(raw===null)throw Error('A selected amount is not a number. Correct it before calculating totals.');basis.push(raw);sum+=scaled(raw||'0')*BigInt(term.sign);
 }
 const raw=unscaled(sum);if(canonicalAmount(raw)!==raw)throw Error('The total exceeds the supported amount range.');return {raw,basis};
}
export function totalsStale(table:NoteNode){try{const cfg=financialConfig(table.attrs?.caFormat);for(const row of table.content??[])for(const cell of row.content??[])if(cell.attrs?.caFormula){const f=totalFormula(cell.attrs.caFormula),result=formulaValues(table,f);if(result.raw!==rawAmount(cell,cfg.number)||JSON.stringify(result.basis)!==JSON.stringify(f.basis))return true;}return false;}catch{return true;}}
export function recalculateTotals(table:NoteNode):NoteNode{
 const cfg=financialConfig(table.attrs?.caFormat);return {...table,attrs:{...table.attrs,caStale:false},content:table.content?.map(row=>({...row,content:row.content?.map(cell=>{if(!cell.attrs?.caFormula)return cell;const f=totalFormula(cell.attrs.caFormula),result=formulaValues(table,f);return numberCell({...cell,attrs:{...cell.attrs,caFormula:JSON.stringify({...f,terms:formulaTerms(table,f),basis:result.basis})}},result.raw,cfg);})}))};
}
export function blankFinancial(table:NoteNode):NoteNode{
 const clear=(n:NoteNode):NoteNode=>({...n,attrs:n.attrs?{...n.attrs,...('blockId'in n.attrs?{blockId:null}:{})}:undefined,content:n.content?.map(clear)});let next=clear(table);const cols=columnsOf(table),labels=new Set(cols.filter(c=>['particulars','left-label','right-label'].includes(c.id)).map(c=>c.id));if(!labels.size){const first=cols.find(c=>c.kind==='text'&&!/date|ref|voucher/i.test(c.label));if(first)labels.add(first.id);}
 next={...next,content:next.content?.map((r,i)=>i===0?r:{...r,content:r.content?.map(c=>!labels.has(String(c.attrs?.caColId))?{...c,attrs:{...c.attrs,caRaw:null},content:[{type:'paragraph',content:workingReferences(c)}]}:c)})};
 return recalculateTotals(next);
}
export function addTotal(table:NoteNode,terms:{row:string;sign:1|-1}[],columnIds:string[],label:string,rowId:string):NoteNode{
 if(!terms.length||terms.length>80||!columnIds.length)throw Error('Choose source rows and at least one numeric column.');const cfg=financialConfig(table.attrs?.caFormat),columns=columnsOf(table),labelColumn=columns.find(c=>['particulars','left-label'].includes(c.id))??columns.find(c=>c.kind==='text');
 if(terms.some(t=>!table.content?.slice(1).some(r=>r.attrs?.caRowId===t.row))||columnIds.some(id=>!columns.some(c=>c.id===id&&c.kind!=='text')))throw Error('Choose valid rows and numeric columns.');
 const row:NoteNode={type:'tableRow',attrs:{caRowId:rowId,...(cfg.workings?{caRole:'subtotal',caTotal:JSON.stringify({version:1,rows:terms,columns:columnIds})}:{})},content:columns.map((col)=>{const formula:TotalFormula={version:1,terms:terms.map(t=>({row:t.row,column:col.id,sign:t.sign})),basis:terms.map(()=> '')};return {type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null,caColId:col.id,caKind:col.kind,...(columnIds.includes(col.id)?{caFormula:JSON.stringify(formula)}:{})},content:[paragraph(col.id===labelColumn?.id?label:'')]};})};
 return recalculateTotals({...table,attrs:{...table.attrs,caFormat:JSON.stringify(cfg)},content:[...(table.content??[]),row]});
}
export function reconfigureTable(table:NoteNode,cfg:FinancialConfig,columns:FinancialColumn[]):NoteNode{
 if(!isSimpleTable(table))throw Error('Unmerge cells before changing this format’s structure. The existing working is unchanged.');if(!columns.length||columns.length>12||new Set(columns.map(c=>c.id)).size!==columns.length)throw Error('Use 1–12 distinct columns.');const old=columnsOf(table),removed=old.filter(c=>!columns.some(n=>n.id===c.id));
 if(removed.some(col=>table.content?.slice(1).some(r=>r.content?.some(c=>c.attrs?.caColId===col.id&&(nodeText(c).trim()||c.attrs?.caFormula)))))throw Error('This layout would remove entered cells. Keep those columns, or insert a blank variant alongside the original.');
 const oldCfg=table.attrs?.caFormat?financialConfig(table.attrs.caFormat):cfg;
 return {...table,attrs:{...table.attrs,caFormat:JSON.stringify(cfg)},content:table.content?.map((r,i)=>({...r,content:columns.map(col=>{const existing=r.content?.find(c=>c.attrs?.caColId===col.id);let next:NoteNode={...(existing??{type:i===0?'tableHeader':'tableCell',content:[paragraph('')]}),attrs:{...(existing?.attrs??{colspan:1,rowspan:1,colwidth:null}),caColId:col.id,caKind:col.kind,...(col.role?{caColRole:col.role}:{})}};if(i===0)return existing&&nodeText(existing)===col.label?next:{...next,content:[{...(existing?.content?.[0]??{type:'paragraph'}),content:paragraph(col.label,existing?.content?.[0]?.content?.[0]?.marks).content}]};if(existing){const raw=rawAmount(existing,oldCfg.number);if(raw!==null&&raw!==''){if(col.kind!=='text')next=numberCell(next,raw,cfg);else if(existing.attrs?.caKind!=='text')next={...next,attrs:{...next.attrs,caRaw:null,caFormula:null},content:[paragraph(raw,existing.content?.[0]?.content?.[0]?.marks)]};}}return next;})}))};
}
export function financialSubtitle(c:FinancialConfig){return [c.variant,...c.periods,c.currency].filter(Boolean).join(' · ');}
export function adoptFinancial(table:NoteNode):NoteNode{
 if(table.attrs?.caFormat)return table;
 const cfg:FinancialConfig={version:1,formatId:'custom',title:'Custom working',variant:'Custom',currency:'₹',periods:[],number:{...DEFAULT_NUMBERS},borders:'grid',density:'compact'};
 const columns=(table.content?.[0]?.content??[]).map((c,i)=>({id:'col-'+i,kind:/amount|debit|credit|balance|cost|value/i.test(nodeText(c))?'amount':'text'}));
 return {...table,attrs:{...table.attrs,caFormat:JSON.stringify(cfg),caStale:false},content:table.content?.map((r,i)=>({...r,attrs:{...r.attrs,caRowId:'row-'+i},content:r.content?.map((c,j)=>({...c,attrs:{...c.attrs,caColId:columns[j]?.id??'col-'+j,caKind:columns[j]?.kind??'text'}}))}))};
}

export function formulaTerms(table:NoteNode,f:TotalFormula):TotalFormula['terms']{
 if(!f.scope)return f.terms;const {section,column}=f.scope;return (table.content??[]).slice(1).filter(r=>r.attrs?.caSection===section&&(r.attrs?.caRole??'item')==='item'&&!r.attrs?.caTotal).map(r=>({row:String(r.attrs?.caRowId),column,sign:r.attrs?.caSign===-1?-1:1}));
}

function workingReferences(n:NoteNode):NoteNode[]{return n.type==='reference'&&n.attrs?.workingTarget?[n]:(n.content??[]).flatMap(workingReferences);}
