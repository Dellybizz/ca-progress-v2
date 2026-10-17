import {chromium} from 'playwright';
import {build} from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:"export * from './lib/notes/ca-formats';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const format=api.CA_FORMATS.find(f=>f.id==='balance');
const table=api.buildCAFormat(format,{title:'Balance sheet',variant:'Vertical',currency:'₹',periods:['2026','2025'],rows:api.formatRows(format,'Vertical')})[2];
const root=process.env.NOTES_PREVIEW_DIR||'/tmp/note-studio-preview';
const server=http.createServer((req,res)=>{const name=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/app.css')?'app.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(root+'/'+name));});
let browser;
try{
 await new Promise(r=>server.listen(8791,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:process.env.CA_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
 const page=await browser.newPage();await page.route('**/api/**',route=>route.fulfill({json:{id:'11111111-1111-4111-8111-111111111111',noteRevision:1}}));
 await page.goto('http://127.0.0.1:8791/notes/new');await page.getByRole('textbox',{name:'Note content',exact:true}).waitFor();
 const report=await page.evaluate(async table=>{
  const editor=document.querySelector('.tiptap').editor;
  const content=[{type:'paragraph',content:[{type:'text',text:'Typing benchmark'}]}];
  for(let i=0;i<20;i++){content.push(structuredClone(table));content.push({type:'paragraph',content:[{type:'text',text:'Working notes '.repeat(80)}]});}
  editor.commands.setContent({type:'doc',content});await new Promise(r=>setTimeout(r,400));
  let snapshots=0;const original=editor.getJSON.bind(editor);editor.getJSON=()=>{snapshots++;return original();};
  editor.commands.setTextSelection(2);const samples=[];
  for(let i=0;i<60;i++){const start=performance.now();editor.commands.insertContent('x');samples.push(performance.now()-start);}
  await new Promise(r=>setTimeout(r,350));
  samples.sort((a,b)=>a-b);const result={tables:20,edits:60,medianMs:samples[30],p95Ms:samples[57],snapshots};
  const rowCount=editor.state.doc.child(1).childCount;
  editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize+4);
  if(!editor.commands.addRowAfter())throw Error('Add row failed');
  if(editor.state.doc.child(1).childCount!==rowCount+1)throw Error('Row was not inserted');
  editor.commands.undo();if(editor.state.doc.child(1).childCount!==rowCount)throw Error('Undo row failed');
  const initial=snapshots;
  for(let i=0;i<15;i++){editor.commands.insertContent('y');await new Promise(r=>setTimeout(r,100));}
  result.continuousSnapshots=snapshots-initial;
  await new Promise(r=>setTimeout(r,200));
  editor.commands.insertContent('latest-hidden-edit');
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
  const expected=JSON.stringify(editor.getJSON());
  await new Promise(r=>setTimeout(r,100));
  const drafts=await new Promise((resolve,reject)=>{const request=indexedDB.open('ca-progress-offline');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const read=db.transaction('meta').objectStore('meta').getAll();read.onsuccess=()=>{db.close();resolve(read.result);};read.onerror=()=>{db.close();reject(read.error);};};});
  result.hiddenDraftMatches=drafts.some(row=>JSON.stringify(row.data?.snapshot?.document?.content)===expected);
  return result;
 },table);
 assert.ok(Number.isFinite(report.p95Ms));
 if(!process.env.NOTES_BASELINE){assert.ok(report.snapshots<=3,'Burst edits must coalesce snapshots');assert.ok(report.continuousSnapshots>=1,'Continuous typing must checkpoint within one second');assert.equal(report.hiddenDraftMatches,true,'Hiding the page must flush the latest edit');}
 if(!process.env.NOTES_BASELINE)await page.getByRole('button',{name:'Table structure controls',exact:true}).click();
 await page.getByRole('button',{name:'Split cell',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Split cell',exact:true}).isDisabled(),!process.env.NOTES_BASELINE);
 assert.equal(await page.getByRole('button',{name:process.env.NOTES_BASELINE?'Row below':'Insert line item below',exact:true}).isEnabled(),true);console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
