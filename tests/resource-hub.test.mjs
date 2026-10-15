import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const dir=await mkdtemp(path.join(process.cwd(),'.resource-hub-test-'));
let compiled;
try {
  const result=await build({stdin:{contents:"export * from './lib/resources/navigation';export * from './lib/resources/library-list';export * from './components/resources/resource-hub-tabs';export * from './lib/resources/file-manager';export * from './components/resources/file-manager';export {sampleManagerFiles} from './components/resources/resource-layout-sample';export * from './components/icai/resource-browser';export {shellNavigation,routeIsActive} from './components/shell/navigation-contract';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'next-link',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'nav',namespace:'nav-mock'}));b.onLoad({filter:/.*/,namespace:'nav-mock'},()=>({contents:"export const usePathname=()=>'/resources';export const useRouter=()=>({refresh(){}});"}));b.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'image-mock'}));b.onLoad({filter:/.*/,namespace:'image-mock'},()=>({contents:"import React from 'react';export default function Image({fill,unoptimized,priority,...props}){return React.createElement('img',props)}"}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"import React from 'react';export default function Link({prefetch,...props}){return React.createElement('a',props)}"}));}}]});
  const file=path.join(dir,'compiled.mjs');await writeFile(file,result.outputFiles[0].text);compiled=await import('file://'+file);
} finally {await rm(dir,{recursive:true,force:true});}
test('legacy resource destinations retain academic and community context without pinning the wrong tab',()=>{
  const params={subjectId:'s&1',chapterId:'c1',communityMessageId:'message1',tab:'my',type:'rtp'};
  const official=new URL(compiled.resourceDestination(params,'icai'),'https://test.example');
  assert.equal(official.pathname,'/resources');assert.equal(official.searchParams.get('subject'),'s&1');assert.equal(official.searchParams.get('tab'),'icai');assert.equal(official.searchParams.has('communityMessageId'),false);
  const own=new URL(compiled.resourceDestination(params,'my'),'https://test.example');assert.equal(own.searchParams.get('communityMessageId'),'message1');assert.equal(own.searchParams.get('chapterId'),'c1');
  assert.equal(compiled.resourceTab(['icai']),'my');assert.equal(compiled.resourceTab('shared'),'shared');
});
test('combined note/file pagination sorts the full collection before slicing and never creates empty out-of-range pages',()=>{
  const notes=[{id:'n1',title:'Zeta',updatedAt:'2026-01-01'},{id:'n2',title:'Alpha',updatedAt:'2026-03-01'}];
  const uploads=[{id:'u1',title:'Beta',updatedAt:'2026-02-01'}];
  const page=compiled.libraryPage(notes,uploads,{kind:'all',sort:'recent',page:1,pageSize:2});assert.deepEqual(page.items.map(x=>x.item.id),['n2','u1']);assert.equal(page.pages,2);
  assert.deepEqual(compiled.libraryPage(notes,uploads,{kind:'all',sort:'title',page:99,pageSize:2}).items.map(x=>x.item.id),['n1']);
  assert.deepEqual(compiled.libraryPage(notes,uploads,{kind:'files',sort:'recent',page:1}).items.map(x=>x.kind),['upload']);
  assert.equal(compiled.libraryPage([],[],{kind:'all',sort:'recent',page:3}).current,1);
  assert.equal(notes[0].id,'n1');
});
test('navigation has one Resources destination and still recognizes note detail pages',()=>{
  const knowledge=compiled.shellNavigation.student.find(s=>s.label==='Knowledge').items;
  assert.equal(knowledge.filter(x=>x.href==='/resources').length,1);assert.equal(knowledge.some(x=>['/notes','/resources/icai'].includes(x.href)),false);
  assert.equal(compiled.routeIsActive({href:'/resources'},'/notes/n1'),true);
  const html=renderToStaticMarkup(React.createElement(compiled.ResourceHubTabs,{tab:'icai',params:{}}));assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.match(html,/ICAI official/);
});
test('embedded ICAI browser keeps source provenance, search and canonical tab form without a second page heading',()=>{
  const resources=Array.from({length:30},(_,i)=>({id:String(i),title:`Material ${i}`,summary:null,type:'rtp',status:'current',officialUrl:'https://icai.org/material',sourceUrl:'https://icai.org',sourceName:'ICAI',firstSeenAt:'2026-01-01',lastVerifiedAt:'2026-10-14',levelCodes:['intermediate'],attemptKeys:['2027-01'],subjects:[]}));
  const catalog={resources,events:[],levels:[{code:'intermediate',name:'Intermediate'}],subjects:[],attempts:[],filters:{level:'intermediate',attempt:'2027-01',subject:'',type:''},verifiedAt:null};
  const html=renderToStaticMarkup(React.createElement(compiled.IcaiResourceBrowser,{catalog,embedded:true,scopeLocked:true}));
  assert.match(html,/<h1>ICAI files<\/h1>/);assert.match(html,/action="\/resources"/);assert.match(html,/name="tab" value="icai"/);assert.match(html,/Search files/);assert.equal((html.match(/class="fm-file-open"[^>]*aria-label="Select Material /g)||[]).length,24);assert.match(html,/1–24 of 30/);
});
test('file types and multi-key sorting retain unknown sizes and stable original data',()=>{
  const files=compiled.sampleManagerFiles;
  assert.equal(compiled.fileKind('application/pdf',''),'pdf');assert.equal(compiled.fileKind('image/png',''),'image');assert.equal(compiled.fileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'),'document');
  const sorted=compiled.sortFiles(files,'size','desc','name');assert.equal(sorted[0].id,'pdf');assert.equal(sorted.at(-1).size,null);assert.equal(files[0].id,'note');
  assert.equal(compiled.sortFiles(files,'name','asc')[0].id,'note');
  const official=compiled.officialFiles([{id:'icai',title:'Official',officialUrl:'https://icai.org/file.pdf?x=1',subjects:[],lastChangedAt:'',lastVerifiedAt:'2026-10-14',firstSeenAt:'2026-10-01',sourceName:'ICAI',sourceUrl:'https://icai.org',type:'rtp',status:'active'}])[0];
  assert.equal(official.kind,'pdf');assert.equal(official.previewUrl,undefined);assert.equal(official.firstSeenAt,'2026-10-01');
});
test('CSV exports selected metadata safely without URLs or spreadsheet formulas',()=>{
  const csv=compiled.filesCsv([{...compiled.sampleManagerFiles[0],name:'=SUM(A1:A2)',owner:'A, "B"'}]);
  assert.match(csv,/'=SUM/);assert.match(csv,/A, ""B""/);assert.doesNotMatch(csv,/https:|\/api\/|storage_path/);
});
test('grid list and compact layouts expose accessible selection buttons and identifiable file types',()=>{
  for(const layout of ['grid','list','compact']){
    const html=renderToStaticMarkup(React.createElement(compiled.FileManager,{files:compiled.sampleManagerFiles,title:'My files',initialLayout:layout,preview:true}));
    assert.match(html,new RegExp(`fm-files--${layout}`));assert.match(html,/Select visible files/);for(const name of ['Grid','List','Compact'])assert.match(html,new RegExp(`aria-label="${name} view"`));assert.match(html,/Select Framework mind map/);assert.match(html,/\/resources-preview\/study-diagram.svg/);assert.match(html,/DOCX/);assert.match(html,/PDF/);assert.doesNotMatch(html,/YOUR STUDY WORKSPACE|Notes, files and official material, together/);
  }
});
