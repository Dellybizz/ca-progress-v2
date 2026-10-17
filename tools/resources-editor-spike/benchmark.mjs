// Isolated model/serialization benchmark; deliberately not a browser typing benchmark.
import {JSDOM} from 'jsdom';
import {performance} from 'node:perf_hooks';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(here,'../../docs/resources/phase0/editor-model-benchmark.json');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://evaluation.invalid'});
for(const key of ['window','document','DOMParser','HTMLElement','Element','Node','Text','DocumentFragment','MutationObserver']) globalThis[key]=key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),0);
globalThis.cancelAnimationFrame=clearTimeout;

const {Editor,Mark,Extension}=await import('@tiptap/core');
const {default:StarterKit}=await import('@tiptap/starter-kit');
const {TableKit}=await import('@tiptap/extension-table');
const {default:TaskList}=await import('@tiptap/extension-task-list');
const {default:TaskItem}=await import('@tiptap/extension-task-item');
const {createHeadlessEditor}=await import('@lexical/headless');
const {$getRoot}=await import('lexical');
const {$generateNodesFromDOM,$generateHtmlFromNodes}=await import('@lexical/html');
const {HeadingNode,QuoteNode}=await import('@lexical/rich-text');
const {ListNode,ListItemNode}=await import('@lexical/list');
const {TableNode,TableRowNode,TableCellNode}=await import('@lexical/table');
const {LinkNode,AutoLinkNode}=await import('@lexical/link');
// Explicit legacy adapters: StarterKit alone does not retain these existing formats.
const LegacyHighlight=Mark.create({name:'legacyHighlight',parseHTML(){return [{tag:'mark'}];},renderHTML(){return ['mark',0];}});
const LegacyDirection=Extension.create({name:'legacyDirection',addGlobalAttributes(){return [{types:['paragraph','heading'],attributes:{dir:{default:null,parseHTML:element=>['rtl','ltr','auto'].includes(element.getAttribute('dir'))?element.getAttribute('dir'):null,renderHTML:attributes=>attributes.dir?{dir:attributes.dir}:{}}}}];}});
const extensions=()=>[StarterKit,TableKit,TaskList,TaskItem.configure({nested:true}),LegacyHighlight,LegacyDirection];
const nodes=[HeadingNode,QuoteNode,ListNode,ListItemNode,TableNode,TableRowNode,TableCellNode,LinkNode,AutoLinkNode];

const fixtures=[
 {id:'legacy-rich',html:'<h2>CA answer</h2><p><strong>Asset</strong> <em>recognition</em> <u>criteria</u> <mark>important</mark></p><ul><li>Evidence</li><li>Measurement</li></ul><blockquote>Source explanation</blockquote><p><a href="https://icai.org/">ICAI source</a></p><table><tbody><tr><th>Particulars</th><th>Amount</th></tr><tr><td>Balance</td><td>1250</td></tr></tbody></table>',sentinels:['CA answer','Asset','recognition','criteria','important','Evidence','Measurement','Source explanation','ICAI source','Particulars','1250']},
 {id:'mixed-language',html:'<h2>लेखा और परीक्षा</h2><p>English हिन्दी اردو العربية १२३ ₹ 1,250 👩🏽‍🎓</p><p dir="rtl">قانون اور مطالعہ</p>',sentinels:['लेखा और परीक्षा','हिन्दी','اردو','العربية','१२३','₹ 1,250','👩🏽‍🎓','قانون اور مطالعہ']},
 {id:'long-1000',html:Array.from({length:1000},(_,i)=>`<p>Section ${i}: accounting evidence and journal workings.</p>`).join(''),sentinels:['Section 0:','Section 499:','Section 999:']},
 {id:'merged-table',html:'<table><tbody><tr><th colspan="2">Audit working</th></tr><tr><td rowspan="2">Evidence</td><td>First</td></tr><tr><td>Second</td></tr></tbody></table>',sentinels:['Audit working','Evidence','First','Second']},
];
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
const summary=values=>({medianMs:+percentile(values,.5).toFixed(3),p95Ms:+percentile(values,.95).toFixed(3),samples:values.length});
function semantics(html){const doc=new JSDOM(html).window.document;return {tables:doc.querySelectorAll('table').length,headings:doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length,highlight:doc.querySelectorAll('mark').length,underline:doc.querySelectorAll('u,[style*="underline"]').length,colspan:doc.querySelector('[colspan="2"]')!==null,rowspan:doc.querySelector('[rowspan="2"]')!==null,rtl:doc.querySelector('[dir="rtl"]')!==null};}

const results=[];
for(const engine of ['tiptap','lexical'])for(const fixture of fixtures){
 const times=[],serializeTimes=[];let html,json,text,roundTripEqual,initialNormalizationChanged=false;
 for(let sample=0;sample<8;sample++){
  const start=performance.now();
  if(engine==='tiptap'){
   const editor=new Editor({extensions:extensions(),content:fixture.html});
   const imported=performance.now();json=editor.getJSON();html=editor.getHTML();text=editor.getText();
   const serialized=performance.now();editor.commands.setContent(json);const canonical=editor.getJSON();initialNormalizationChanged=JSON.stringify(json)!==JSON.stringify(canonical);editor.commands.setContent(canonical);roundTripEqual=JSON.stringify(canonical)===JSON.stringify(editor.getJSON());json=canonical;html=editor.getHTML();text=editor.getText();editor.destroy();
   if(sample){times.push(imported-start);serializeTimes.push(serialized-imported);}
  }else{
   const editor=createHeadlessEditor({namespace:'CAEvaluation',nodes,onError:error=>{throw error;}});
   editor.update(()=>{$getRoot().clear();$getRoot().append(...$generateNodesFromDOM(editor,new DOMParser().parseFromString(fixture.html,'text/html')));},{discrete:true});
   const imported=performance.now();json=editor.getEditorState().toJSON();html=editor.getEditorState().read(()=>$generateHtmlFromNodes(editor,null));text=editor.getEditorState().read(()=>$getRoot().getTextContent());
   const serialized=performance.now();editor.setEditorState(editor.parseEditorState(JSON.stringify(json)));roundTripEqual=JSON.stringify(json)===JSON.stringify(editor.getEditorState().toJSON());
   if(sample){times.push(imported-start);serializeTimes.push(serialized-imported);}
  }
 }
 const missingText=fixture.sentinels.filter(value=>!text.includes(value));
 const inputSemantics=semantics(fixture.html),outputSemantics=semantics(html);
 const lostSemantics=Object.keys(inputSemantics).filter(key=>inputSemantics[key]!==false&&inputSemantics[key]!==0&&inputSemantics[key]!==outputSemantics[key]);
 results.push({engine,fixture:fixture.id,inputBytes:Buffer.byteLength(fixture.html),jsonBytes:Buffer.byteLength(JSON.stringify(json)),import:summary(times),serialization:summary(serializeTimes),missingText,initialNormalizationChanged,jsonRoundTripEqual:roundTripEqual,inputSemantics,outputSemantics,lostSemantics});
 if(missingText.length||!roundTripEqual||lostSemantics.length)throw Error(`${engine}/${fixture.id}: ${JSON.stringify({missingText,roundTripEqual,lostSemantics})}`);
}
const entries={
 tiptap:"export {Editor} from '@tiptap/core'; import StarterKit from '@tiptap/starter-kit'; import {TableKit} from '@tiptap/extension-table'; import TaskList from '@tiptap/extension-task-list'; import TaskItem from '@tiptap/extension-task-item'; export const extensions=[StarterKit,TableKit,TaskList,TaskItem];",
 lexical:"export {createEditor} from 'lexical'; export {HeadingNode,QuoteNode} from '@lexical/rich-text'; export {ListNode,ListItemNode} from '@lexical/list'; export {TableNode,TableRowNode,TableCellNode} from '@lexical/table'; export {LinkNode,AutoLinkNode} from '@lexical/link'; export {$generateNodesFromDOM,$generateHtmlFromNodes} from '@lexical/html';",
};
const bundles={};for(const[engine,contents]of Object.entries(entries)){const bundle=await build({stdin:{contents,resolveDir:here,sourcefile:`${engine}-probe.js`},bundle:true,write:false,minify:true,platform:'browser',format:'esm',target:'chrome120',define:{'process.env.NODE_ENV':'"production"'},legalComments:'none'});const bytes=bundle.outputFiles[0].contents;bundles[engine]={rawBytes:bytes.length,gzipBytes:gzipSync(bytes).length,scope:'core + rich text + lists + links + tables; no React toolbar, ink, PDF or collaboration; not a feature-equivalent full application'};}
const manifest=JSON.parse(await readFile(path.join(here,'package.json'),'utf8'));
const licenses={};for(const name of Object.keys(manifest.dependencies)){const data=JSON.parse(await readFile(path.join(here,'node_modules',name,'package.json'),'utf8'));licenses[name]={version:data.version,license:data.license};}
const report={schemaVersion:1,recordedAt:new Date().toISOString(),node:process.version,platform:`${process.platform}/${process.arch}`,method:'JSDOM model import and serialization; 1 warmup + 7 measured samples; Tiptap creates a view and Lexical is headless: initialization timings are not equivalent workloads and cannot rank typing speed. No layout/paint, Android, IME or palm-rejection claim.',adapters:{tiptap:'Explicit mark and direction adapters; one-time table trailing-paragraph canonicalization recorded, then JSON stability tested',lexical:'Built-in rich-text/list/table/link nodes'},lockSha256:createHash('sha256').update(await readFile(path.join(here,'package-lock.json'))).digest('hex'),licenses,bundles,results};
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,bundles,results:results.map(({engine,fixture,import:timing,missingText,jsonRoundTripEqual,outputSemantics})=>({engine,fixture,...timing,missingText,jsonRoundTripEqual,outputSemantics}))},null,2));
dom.window.close();
