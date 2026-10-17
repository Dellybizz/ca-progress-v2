import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const result=await build({stdin:{contents:"export * from './lib/notes/financial-formats';export * from './lib/notes/ca-formats';export * from './lib/notes/structured-document';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'}),api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const make=(id='balance',variant='Vertical')=>{const f=api.CA_FORMATS.find(f=>f.id===id);return api.buildCAFormat(f,{title:f.name,variant,currency:'₹',periods:['2026','2025'],rows:api.formatRows(f,variant)})[2];};
const write=(table,row,col,value)=>{const n=structuredClone(table),cell=n.content[row].content.find(c=>c.attrs.caColId===col);cell.content=[{type:'paragraph',content:value?[{type:'text',text:value}]:[]}];cell.attrs.caRaw=null;return n;};
const doc=t=>({schemaVersion:1,engine:'tiptap',engineSchemaVersion:1,kind:'document',entryId:'financial-test',revisionId:'test',content:{type:'doc',content:[t]},attachmentIds:[],sourceAttribution:null,layout:api.DEFAULT_LAYOUT});
test('priority CA formats have distinct, accounting-specific structures',()=>{
 assert.equal(api.columnsOf(make('balance','Horizontal')).length,4);assert.ok(api.columnsOf(make()).some(c=>c.id==='notes'));assert.ok(api.columnsOf(make('balance','Comparative')).some(c=>c.kind==='percent'));
 assert.equal(api.columnsOf(make('ledger','T-account')).length,8);assert.equal(api.columnsOf(make('ledger','Running balance')).length,6);assert.equal(api.columnsOf(make('cashbook','Single column')).length,6);assert.equal(api.columnsOf(make('cashbook','Double column')).length,8);assert.equal(api.columnsOf(make('cashbook','Triple column')).length,10);
 assert.match(JSON.stringify(make('journal','Opening entries')),/Opening assets/);assert.notDeepEqual(make('cashflow','Direct method').content,make('cashflow','Indirect method').content);assert.ok(api.columnsOf(make('trial','Pre / post adjustment')).some(c=>c.id==='adjusted-credit'));assert.ok(api.columnsOf(make('cost','Per-unit cost')).some(c=>c.id==='units'));
});
test('reconfiguration retains entered figures, precision, stable identities and inline marks',()=>{
 let table=write(make(),1,'period-0','125000.123456');table.content[1].content.find(c=>c.attrs.caColId==='period-0').content[0].content[0].marks=[{type:'bold'}];const cfg=api.financialConfig(table.attrs.caFormat),columns=api.columnsOf(table),style={...cfg,variant:'Comparative',number:{...cfg.number,decimals:0,grouping:'western'}};
 table=api.reconfigureTable(table,style,api.financialColumns(api.CA_FORMATS[0],style));let cell=table.content[1].content.find(c=>c.attrs.caColId==='period-0');assert.equal(api.nodeText(cell),'125,000');assert.equal(cell.attrs.caRaw,'125000.123456');assert.deepEqual(cell.content[0].content[0].marks,[{type:'bold'}]);
 const full={...style,number:{...style.number,decimals:6,grouping:'indian'}};table=api.reconfigureTable(table,full,api.columnsOf(table).toReversed());cell=table.content[1].content.find(c=>c.attrs.caColId==='period-0');assert.equal(api.nodeText(cell),'1,25,000.123456');assert.equal(cell.attrs.caRaw,'125000.123456');assert.equal(table.content[1].attrs.caRowId,'row-1');
 assert.deepEqual(api.readStructuredNote(JSON.stringify(doc(table))),doc(table));assert.throws(()=>api.reconfigureTable(table,full,columns.filter(c=>c.id!=='period-0')),/remove entered cells/);
 const merged=structuredClone(table);merged.content[1].content[0].attrs.colspan=2;assert.throws(()=>api.reconfigureTable(merged,full,api.columnsOf(table)),/Unmerge/);
});
test('explicit totals use exact decimals, signed sources and visible stale state',()=>{
 let table=write(write(make(),1,'period-0','0.1'),2,'period-0','0.2');table=api.addTotal(table,[{row:'row-1',sign:1},{row:'row-2',sign:1}],['period-0'],'Selected total','selected-total');const output=t=>t.content.at(-1).content.find(c=>c.attrs.caColId==='period-0');assert.equal(output(table).attrs.caRaw,'0.3');assert.equal(api.nodeText(output(table)),'0.30');assert.equal(api.totalsStale(table),false);
 table=write(table,1,'period-0','0.4');assert.equal(api.totalsStale(table),true);assert.match(api.renderStructuredNote(doc(table)),/Totals need recalculation/);table=api.recalculateTotals(table);assert.equal(output(table).attrs.caRaw,'0.6');assert.equal(api.totalsStale(table),false);
 const copy=api.blankFinancial(table);assert.equal(api.nodeText(copy.content[1].content.find(c=>c.attrs.caColId==='period-0')),'');assert.equal(output(copy).attrs.caRaw,'0');assert.equal(output(table).attrs.caRaw,'0.6');
 table=api.addTotal(table,[{row:'row-1',sign:1},{row:'row-2',sign:-1}],['period-0'],'Net','net-total');assert.equal(output(table).attrs.caRaw,'0.2');
});
test('invalid numbers, missing sources and circular totals cannot silently produce a result',()=>{
 let table=write(make(),1,'period-0','Narration 20');assert.throws(()=>api.addTotal(table,[{row:'row-1',sign:1}],['period-0'],'Total','total'),/not a number/);
 table=write(table,1,'period-0','10');table=api.addTotal(table,[{row:'row-1',sign:1}],['period-0'],'Total','total');table.content.splice(1,1);assert.equal(api.totalsStale(table),true);assert.throws(()=>api.recalculateTotals(table),/removed row/);
 const cell=table.content.at(-1).content.find(c=>c.attrs.caFormula);cell.attrs.caFormula=JSON.stringify({version:1,terms:[{row:'total',column:'period-0',sign:1}],basis:['10']});assert.throws(()=>api.recalculateTotals(table),/circular/);
});
test('number styles, metadata and formula bounds reject unsafe or unsupported values',()=>{
 for(const v of ['1,2,3','Infinity','1e12','12<script>','1.1234567'])assert.equal(api.canonicalAmount(v),null);assert.equal(api.canonicalAmount('(1,23,456.50)'),'-123456.5');assert.equal(api.canonicalAmount('123,456.50'),'123456.5');
 const table=make(),cfg=api.financialConfig(table.attrs.caFormat);for(const patch of [{version:2},{borders:'position:fixed'},{number:{...cfg.number,decimals:12}},{periods:['1','2','3','4','5']}])assert.throws(()=>api.financialConfig(JSON.stringify({...cfg,...patch})));
 assert.throws(()=>api.totalFormula(JSON.stringify({version:1,terms:[{row:'x',column:'y',sign:1}],basis:['0'],eval:'alert(1)'})));
 const cell={type:'tableCell',attrs:{caRaw:'999',caKind:'amount'},content:[{type:'paragraph',content:[{type:'text',text:'120'}]}]};assert.equal(api.rawAmount(cell,cfg.number),'120');
 for(const [key,value]of [['caRaw','1;position:fixed'],['caKind','script'],['caFormula','{"version":2}']]){const bad=structuredClone(table);bad.content[1].content[0].attrs[key]=value;assert.throws(()=>api.validateStructuredNote(doc(bad)));}
});

test('CA exercise: journal entries retain narration and calculate balanced debit/credit totals',()=>{
 let table=make('journal','Standard');table=write(table,1,'date','17-10-2026');table=write(table,1,'particulars','Cash A/c Dr.');table=write(table,1,'debit','100000');table=write(table,2,'particulars','To Capital A/c');table=write(table,2,'credit','100000');
 table=api.addTotal(table,[{row:'row-1',sign:1},{row:'row-2',sign:1}],['debit','credit'],'Journal totals','journal-totals');const total=table.content.at(-1);assert.equal(total.content.find(c=>c.attrs.caColId==='debit').attrs.caRaw,'100000');assert.equal(total.content.find(c=>c.attrs.caColId==='credit').attrs.caRaw,'100000');assert.match(api.renderStructuredNote(doc(table)),/1,00,000.00/);assert.match(api.renderStructuredNote(doc(table)),/Cash A\/c Dr./);assert.equal(api.nodeText(table.content[1].content[0]),'17-10-2026');const blank=api.blankFinancial(table);assert.equal(api.nodeText(blank.content[1].content[0]),'');assert.match(api.nodeText(blank),/Cash A\/c Dr./);assert.match(api.renderStructuredNote(doc(table)),/<thead>/);
});
test('read-only and PDF HTML honor numeric settings even for a save made before cell blur',()=>{
 const table=write(make(),1,'period-0','125000.123456'),before=JSON.stringify(table),html=api.renderStructuredNote(doc(table));assert.match(html,/1,25,000.12/);assert.equal(JSON.stringify(table),before);assert.match(api.nodeText(table.content[1].content.find(c=>c.attrs.caColId==='period-0')),/125000.123456/);
});
