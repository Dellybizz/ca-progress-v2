import {renderDiagram,validateDiagram} from './ca-formats';
/** Versioned, bounded document protocol. No DOM or editor dependency on the server. */
export type NoteNode={type:string;attrs?:Record<string,unknown>;text?:string;marks?:NoteNode[];content?:NoteNode[]};
export type NoteLayout={mode:'continuous'|'page';paper:'a4'|'letter'|'custom';width:number;margin:number;header:string;footer:string;pageNumbers:boolean;language?:'en'|'hi'|'ur'|'ar'};
export type StructuredNote={schemaVersion:1;engine:'tiptap';engineSchemaVersion:1;kind:'document';entryId:string;revisionId:string;content:NoteNode;attachmentIds:string[];sourceAttribution:unknown;layout:NoteLayout;legacyHtml?:string};
export const DEFAULT_LAYOUT:NoteLayout={mode:'continuous',paper:'a4',width:210,margin:20,header:'',footer:'',pageNumbers:true};
export const NOTE_FONTS=['Inter','Arial','Georgia','Times New Roman','Courier New'] as const;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function safeNoteLink(v:unknown){return typeof v==='string'&&(/^(https?:\/\/|mailto:)/i.test(v)||/^#block-[\w-]+$/.test(v))&&!/[\u0000-\u0020<>"']/.test(v)&&!/[?&](?:[^=]*(?:token|signature|credential)|expires)=/i.test(v);}
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const inline=new Set(['text','hardBreak','image','math','reference','attachment']);
const blocks=new Set(['paragraph','heading','bulletList','orderedList','taskList','blockquote','codeBlock','horizontalRule','table','callout','toggle','pageBreak','diagram']);
const allowedAttrs:Record<string,string[]>={diagram:['blockId','kind','title','variant','data'],doc:[],text:[],hardBreak:[],paragraph:['blockId','textAlign','lineHeight','indent','dir'],heading:['blockId','level','textAlign','lineHeight','indent','dir'],bulletList:['blockId'],orderedList:['blockId','start'],listItem:['blockId'],taskList:['blockId'],taskItem:['blockId','checked'],blockquote:['blockId'],codeBlock:['blockId','language'],horizontalRule:['blockId'],table:['blockId'],tableRow:[],tableCell:['colspan','rowspan','colwidth','textAlign','align'],tableHeader:['colspan','rowspan','colwidth','textAlign','align'],image:['src','alt','title','width','caption','crop'],math:['expression'],reference:['label','href'],attachment:['resourceId','label'],callout:['blockId'],toggle:['blockId','summary','open'],pageBreak:['blockId']};
const markAttrs:Record<string,string[]>={bold:[],italic:[],underline:[],strike:[],code:[],subscript:[],superscript:[],link:['href','target','rel','class'],highlight:['color'],textStyle:['fontFamily','fontSize','color']};
function fail():never{throw Error('Unsupported or invalid structured note. Your original content has been retained.');}
export function validateStructuredNote(value:unknown,attachmentIds?:string[]):StructuredNote{
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const d=value as StructuredNote;if(d.schemaVersion!==1||d.engine!=='tiptap'||d.engineSchemaVersion!==1||d.kind!=='document'||typeof d.entryId!=='string'||d.entryId.length>160||typeof d.revisionId!=='string'||d.revisionId.length>160)fail();
 if(new TextEncoder().encode(JSON.stringify(d)).length>600_000)throw Error('Structured note is too large. Split it into smaller notes.');
 if(!Array.isArray(d.attachmentIds)||d.attachmentIds.length>20||d.attachmentIds.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))fail();
 if(attachmentIds&&(d.attachmentIds.some(id=>!attachmentIds.includes(id))||attachmentIds.some(id=>!d.attachmentIds.includes(id))))fail();
 const ids=new Set<string>();let count=0,textBytes=0;
 function walk(n:NoteNode,depth:number,mark=false){
  if(!n||typeof n!=='object'||Array.isArray(n)||depth>32||++count>12000)fail();
  const names=(mark?markAttrs:allowedAttrs)[n.type];if(!names||Object.keys(n).some(k=>!['type','attrs','content','text','marks'].includes(k)))fail();
  if(n.attrs&&(!n.attrs||typeof n.attrs!=='object'||Array.isArray(n.attrs)||Object.keys(n.attrs).some(k=>!names.includes(k))))fail();
  const a=n.attrs??{};
  for(const [key,v]of Object.entries(a)){
   if(v===null)continue;
   if(key==='blockId'){if(typeof v!=='string'||!/^block-[\w-]{1,100}$/.test(v)||ids.has(v))fail();ids.add(v);}
   else if(key==='href'){if(!safeNoteLink(v))fail();}
   else if(key==='src'){if(typeof v!=='string'||!/^\/api\/resources\/[0-9a-f-]{36}\/access$/i.test(v)||!d.attachmentIds.includes(v.split('/')[3]))fail();}
   else if(key==='resourceId'){if(typeof v!=='string'||!d.attachmentIds.includes(v))fail();}
   else if(key==='dir'){if(!['rtl','ltr','auto'].includes(String(v)))fail();}
   else if(key==='color'){if(!color(v))fail();}
   else if(key==='fontFamily'){if(!NOTE_FONTS.includes(v as typeof NOTE_FONTS[number]))fail();}
   else if(key==='fontSize'){if(!['12px','14px','16px','18px','20px','24px','28px','32px'].includes(String(v)))fail();}
   else if(key==='textAlign'||key==='align'){if(!['left','center','right','justify'].includes(String(v)))fail();}
   else if(key==='lineHeight'){if(!['1','1.5','2'].includes(String(v)))fail();}
   else if(key==='indent'){if(!Number.isInteger(v)||Number(v)<0||Number(v)>8)fail();}
   else if(['level','start','colspan','rowspan','width'].includes(key)){if(!Number.isInteger(v)||Number(v)<1||Number(v)>(key==='level'?4:key==='width'?100:key==='start'?999:12))fail();}
   else if(key==='colwidth'){if(!Array.isArray(v)||v.length>12||v.some(w=>!Number.isInteger(w)||w<25||w>1600))fail();}
   else if(['checked','open'].includes(key)){if(typeof v!=='boolean')fail();}
   else if(key==='crop'){if(!['contain','cover'].includes(String(v)))fail();}
   else if(typeof v!=='string'||v.length>(key==='data'?6000:2000))fail();
  }
  if(n.type==='diagram'){if(typeof a.kind!=='string'||typeof a.data!=='string'||typeof a.title!=='string'||typeof a.variant!=='string')fail();validateDiagram(a.kind,a.data);}
  if(n.type==='image'&&(!a.src||typeof a.src!=='string'))fail();if(n.type==='attachment'&&!a.resourceId)fail();if(n.type==='math'&&(typeof a.expression!=='string'||a.expression.length>2000))fail();if(n.type==='reference'&&(!safeNoteLink(a.href)||typeof a.label!=='string'))fail();
  if(n.type==='text'){if(typeof n.text!=='string'||n.content)fail();textBytes+=new TextEncoder().encode(n.text).length;}else if(n.text!==undefined)fail();
  if(n.marks){if(mark||!inline.has(n.type)||!Array.isArray(n.marks)||n.marks.length>12)fail();n.marks.forEach(m=>walk(m,depth+1,true));}
  if(n.content!==undefined&&!Array.isArray(n.content))fail();
  const children=n.content??[];
  if(mark&&(children.length||n.text))fail();
  for(const child of children){
   const ok=n.type==='doc'||['blockquote','callout','toggle','listItem','taskItem','tableCell','tableHeader'].includes(n.type)?blocks.has(child.type):['paragraph','heading'].includes(n.type)?inline.has(child.type):n.type==='codeBlock'?child.type==='text':['bulletList','orderedList'].includes(n.type)?child.type==='listItem':n.type==='taskList'?child.type==='taskItem':n.type==='table'?child.type==='tableRow':n.type==='tableRow'?['tableCell','tableHeader'].includes(child.type):false;
   if(!ok)fail();walk(child,depth+1);
  }
  if(['doc','table','tableRow','listItem','taskItem','tableCell','tableHeader','bulletList','orderedList','taskList','callout','toggle','blockquote'].includes(n.type)&&!children.length)fail();
 }
 if(d.content?.type!=='doc')fail();walk(d.content,0);if(textBytes>120000)throw Error('Note text is too large. Split it into smaller notes.');
 const l=d.layout;if(!l||(l.language!==undefined&&!['en','hi','ur','ar'].includes(l.language))||!['continuous','page'].includes(l.mode)||!['a4','letter','custom'].includes(l.paper)||!Number.isFinite(l.width)||l.width<100||l.width>300||!Number.isFinite(l.margin)||l.margin<5||l.margin>40||typeof l.header!=='string'||l.header.length>160||typeof l.footer!=='string'||l.footer.length>160||typeof l.pageNumbers!=='boolean')fail();
 if(d.legacyHtml!==undefined&&(typeof d.legacyHtml!=='string'||new TextEncoder().encode(d.legacyHtml).length>200000))fail();
 return d;
}
export function renderStructuredNote(d:StructuredNote){
 validateStructuredNote(d);
 function render(n:NoteNode):string{
  const a=n.attrs??{},children=(n.content??[]).map(render).join('');
  let style='';if(a.textAlign||a.align)style+=`text-align:${a.textAlign??a.align};`;if(a.lineHeight)style+=`line-height:${a.lineHeight};`;if(a.indent)style+=`margin-left:${Number(a.indent)*24}px;`;
  const attrs=`${a.dir?` dir="${esc(a.dir)}"`:''}${a.blockId?` id="${esc(a.blockId)}"`:''}${style?` style="${style}"`:''}`;
  if(n.type==='text'){let s=esc(n.text);for(const m of n.marks??[]){const ma=m.attrs??{};const tag=({bold:'strong',italic:'em',underline:'u',strike:'s',subscript:'sub',superscript:'sup',code:'code'}as Record<string,string>)[m.type];if(tag)s=`<${tag}>${s}</${tag}>`;else if(m.type==='link')s=`<a href="${esc(ma.href)}" rel="noopener noreferrer">${s}</a>`;else if(m.type==='highlight')s=`<mark${ma.color?` style="background-color:${ma.color}"`:''}>${s}</mark>`;else if(m.type==='textStyle')s=`<span style="${ma.color?`color:${ma.color};`:''}${ma.fontFamily?`font-family:${esc(ma.fontFamily)};`:''}${ma.fontSize?`font-size:${ma.fontSize};`:''}">${s}</span>`;}return s;}
  const tags:Record<string,string>={paragraph:'p',heading:`h${a.level??2}`,bulletList:'ul',orderedList:'ol',listItem:'li',taskList:'ul',taskItem:'li',blockquote:'blockquote',table:'table',tableRow:'tr',tableCell:'td',tableHeader:'th',callout:'aside'};
  if(n.type==='doc')return children;
  if(n.type==='diagram')return `<figure class="note-diagram"${attrs}><figcaption>${esc(a.title)}</figcaption><div class="note-diagram-graphic">${renderDiagram(String(a.kind),String(a.data),String(a.title),String(a.variant))}</div><details><summary>Chart data</summary><pre>${esc(a.data)}</pre></details></figure>`;
  if(n.type==='hardBreak')return '<br>';
  if(n.type==='horizontalRule')return `<hr${attrs}>`;
  if(n.type==='pageBreak')return `<hr${attrs} class="note-page-break">`;
  if(n.type==='codeBlock')return `<pre${attrs}><code>${children}</code></pre>`;
  if(n.type==='math')return `<span class="note-math" data-expression="${esc(a.expression)}" role="math">${esc(a.expression)}</span>`;
  if(n.type==='attachment')return `<a class="note-attachment" href="/resources/${esc(a.resourceId)}">${esc(a.label??'Attached file')}</a>`;
  if(n.type==='reference')return `<a class="note-reference" href="${esc(a.href)}" rel="noopener noreferrer">[${esc(a.label)}]</a>`;
  if(n.type==='image')return `<img src="${esc(a.src)}" alt="${esc(a.alt)}" title="${esc(a.caption??a.title)}" style="width:${Number(a.width)||100}%;object-fit:${a.crop==='cover'?'cover':'contain'}" loading="lazy">${a.caption?`<em>${esc(a.caption)}</em>`:''}`;
  if(n.type==='toggle')return `<details${attrs}${a.open?' open':''}><summary>${esc(a.summary??'Details')}</summary>${children}</details>`;
  const tag=tags[n.type];return `<${tag}${attrs}${n.type==='taskList'?' data-type="taskList"':''}${n.type==='taskItem'?` data-checked="${a.checked===true}"`:''}${['tableCell','tableHeader'].includes(n.type)?` colspan="${Number(a.colspan)||1}" rowspan="${Number(a.rowspan)||1}"`:''}${n.type==='orderedList'?` start="${Number(a.start)||1}"`:''}>${n.type==='taskItem'?(a.checked?'☑ ':'☐ '):''}${children}</${tag}>`;
 }
 const html=render(d.content);if(new TextEncoder().encode(html).length>200000)throw Error('Rendered note is too large. Split it into smaller notes.');return html;
}
export function readStructuredNote(json:string|null|undefined){if(!json)return null;try{const d=JSON.parse(json);return d.engine==='tiptap'?validateStructuredNote(d):null;}catch{return null;}}
