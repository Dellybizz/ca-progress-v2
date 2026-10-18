import {validPaperLines,type PaperLines} from './page-paper';
import {normalizeWorkingNotes} from './working-notes';
import {rowCalculation,columnRoles} from './accounting-semantics';
import {parseInk,renderInk} from './ink-model';
import {financialConfig,totalFormula,canonicalAmount,rawAmount,numberCell,totalsStale,type FinancialConfig} from './financial-formats';
import {renderDiagram,validateDiagram} from './ca-formats';
/** Versioned, bounded document protocol. No DOM or editor dependency on the server. */
export type NoteNode={type:string;attrs?:Record<string,unknown>;text?:string;marks?:NoteNode[];content?:NoteNode[]};
export type NoteLayout={mode:'continuous'|'page';paper:'a4'|'letter'|'custom';width:number;margin:number;header:string;footer:string;pageNumbers:boolean;orientation?:'portrait'|'landscape';workingWidth?:'readable'|'wide'|'full';height?:number;language?:'en'|'hi'|'ur'|'ar';lines?:PaperLines;pageLines?:Record<string,PaperLines>};
export type StructuredNote={schemaVersion:1;engine:'tiptap';engineSchemaVersion:1;kind:'document';entryId:string;revisionId:string;content:NoteNode;attachmentIds:string[];sourceAttribution:unknown;layout:NoteLayout;legacyHtml?:string};
export const DEFAULT_LAYOUT:NoteLayout={mode:'continuous',paper:'a4',orientation:'portrait',workingWidth:'wide',width:210,margin:20,header:'',footer:'',pageNumbers:true};
export function notePageSize(layout:NoteLayout){
 const width=layout.paper==='a4'?210:layout.paper==='letter'?215.9:layout.width;
 const height=layout.paper==='a4'?297:layout.paper==='letter'?279.4:layout.height??297;
 return layout.orientation==='landscape'?{width:Math.max(width,height),height:Math.min(width,height)}:{width:Math.min(width,height),height:Math.max(width,height)};
}
export function notePrintSize(layout:NoteLayout){const page=notePageSize(layout);return `${page.width}mm ${page.height}mm`;}
export const NOTE_FONTS=['Inter','Arial','Georgia','Times New Roman','Courier New'] as const;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function safeNoteLink(v:unknown){return typeof v==='string'&&(/^(https?:\/\/|mailto:)/i.test(v)||/^#block-[\w-]+$/.test(v))&&!/[\u0000-\u0020<>"']/.test(v)&&!/[?&](?:[^=]*(?:token|signature|credential)|expires)=/i.test(v);}
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const inline=new Set(['text','hardBreak','image','math','reference','attachment']);
const blocks=new Set(['paragraph','heading','bulletList','orderedList','taskList','blockquote','codeBlock','horizontalRule','table','callout','toggle','pageBreak','diagram','ink','account','workingNote']);
const allowedAttrs:Record<string,string[]>={workingNote:['blockId','number','backlinks'],account:['blockId'],ink:['blockId','data','label','width'],diagram:['blockId','kind','title','variant','data','width','height','align'],doc:[],text:[],hardBreak:[],paragraph:['blockId','textAlign','lineHeight','indent','dir','caOwner','caCaption'],heading:['blockId','level','textAlign','lineHeight','indent','dir','caOwner','caCaption'],bulletList:['blockId'],orderedList:['blockId','start'],listItem:['blockId'],taskList:['blockId'],taskItem:['blockId','checked'],blockquote:['blockId'],codeBlock:['blockId','language'],horizontalRule:['blockId'],table:['blockId','caFormat','caStale','caWidth'],tableRow:['caRowId','caRole','caHeight','caSection','caTotal','caSign'],tableCell:['colspan','rowspan','colwidth','textAlign','align','caColId','caColRole','caKind','caRaw','caFormula','caFill','caBorder'],tableHeader:['colspan','rowspan','colwidth','textAlign','align','caColId','caColRole','caKind','caRaw','caFormula','caFill','caBorder'],image:['src','alt','title','width','caption','crop','height','align'],math:['expression'],reference:['blockId','label','href','workingTarget'],attachment:['resourceId','label'],callout:['blockId'],toggle:['blockId','summary','open'],pageBreak:['blockId']};
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
   else if(key==='workingTarget'){if(typeof v!=='string'||!/^block-[\w-]{1,100}$/.test(v))fail();}
   else if(key==='number'){if(!Number.isInteger(v)||Number(v)<1||Number(v)>400)fail();}
   else if(key==='backlinks'){if(!Array.isArray(v)||v.length>80||v.some(id=>typeof id!=='string'||!/^block-[\w-]{1,100}$/.test(id)))fail();}
   else if(key==='caFormat'){financialConfig(v);}
   else if(key==='caTotal'){rowCalculation(v);}
   else if(key==='caSection'){if(typeof v!=='string'||!/^[-\w]{1,80}$/.test(v))fail();}
   else if(key==='caSign'){if(v!==1&&v!==-1)fail();}
   else if(key==='caColRole'){if(!columnRoles.includes(v as typeof columnRoles[number]))fail();}
   else if(key==='caFormula'){totalFormula(v);}
   else if(key==='caRaw'){if(typeof v!=='string'||canonicalAmount(v)!==v)fail();}
   else if(key==='caStale'){if(typeof v!=='boolean')fail();}
   else if(key==='caOwner'||key==='caRowId'||key==='caColId'){if(typeof v!=='string'||!/^[-\w]{1,100}$/.test(v))fail();}
   else if(key==='caCaption'){if(!['title','subtitle'].includes(String(v)))fail();}
   else if(key==='caRole'){if(!['item','section','working','subtotal'].includes(String(v)))fail();}
   else if(key==='caFill'||key==='caBorder'){if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))fail();}
   else if(key==='caHeight'){if(!Number.isInteger(v)||Number(v)<24||Number(v)>400)fail();}
   else if(key==='caWidth'){if(!Number.isInteger(v)||Number(v)<25||Number(v)>100)fail();}
   else if(key==='caKind'){if(!['text','amount','number','percent'].includes(String(v)))fail();}
   else if(key==='href'){if(!safeNoteLink(v))fail();}
   else if(key==='src'){if(typeof v!=='string'||!/^\/api\/resources\/[0-9a-f-]{36}\/access$/i.test(v)||!d.attachmentIds.includes(v.split('/')[3]))fail();}
   else if(key==='resourceId'){if(typeof v!=='string'||!d.attachmentIds.includes(v))fail();}
   else if(key==='dir'){if(!['rtl','ltr','auto'].includes(String(v)))fail();}
   else if(key==='color'){if(!color(v))fail();}
   else if(key==='fontFamily'){if(!NOTE_FONTS.includes(v as typeof NOTE_FONTS[number]))fail();}
   else if(key==='fontSize'){if(!['12px','14px','16px','18px','20px','24px','28px','32px'].includes(String(v)))fail();}
   else if(key==='height'){if(!Number.isInteger(v)||Number(v)<80||Number(v)>1600)fail();}
   else if(key==='textAlign'||key==='align'){if(!['left','center','right','justify'].includes(String(v)))fail();}
   else if(key==='lineHeight'){if(!['1','1.5','2'].includes(String(v)))fail();}
   else if(key==='indent'){if(!Number.isInteger(v)||Number(v)<0||Number(v)>8)fail();}
   else if(['level','start','colspan','rowspan','width'].includes(key)){if(!Number.isInteger(v)||Number(v)<1||Number(v)>(key==='level'?4:key==='width'?100:key==='start'?999:12))fail();}
   else if(key==='colwidth'){if(!Array.isArray(v)||v.length>12||v.some(w=>!Number.isInteger(w)||w<25||w>1600))fail();}
   else if(['checked','open'].includes(key)){if(typeof v!=='boolean')fail();}
   else if(key==='crop'){if(!['contain','cover'].includes(String(v)))fail();}
   else if(typeof v!=='string'||v.length>(key==='data'?(n.type==='ink'?220000:40000):2000))fail();
  }
  if(n.type==='ink'){parseInk(a.data);if(typeof a.label!=='string'||a.label.length>160)fail();}
  if(n.type==='diagram'){if(typeof a.kind!=='string'||typeof a.data!=='string'||typeof a.title!=='string'||typeof a.variant!=='string')fail();validateDiagram(a.kind,a.data);}
  if(n.type==='image'&&(!a.src||typeof a.src!=='string'))fail();if(n.type==='attachment'&&!a.resourceId)fail();if(n.type==='math'&&(typeof a.expression!=='string'||a.expression.length>2000))fail();if(n.type==='reference'&&(!safeNoteLink(a.href)||typeof a.label!=='string'))fail();
  if(n.type==='text'){if(typeof n.text!=='string'||n.content)fail();textBytes+=new TextEncoder().encode(n.text).length;}else if(n.text!==undefined)fail();
  if(n.marks){if(mark||!inline.has(n.type)||!Array.isArray(n.marks)||n.marks.length>12)fail();n.marks.forEach(m=>walk(m,depth+1,true));}
  if(n.content!==undefined&&!Array.isArray(n.content))fail();
  const children=n.content??[];
  if(n.type==='reference'&&a.workingTarget&&a.href!=='#'+a.workingTarget)fail();
  if(n.type==='workingNote'&&(!a.blockId||!children.length||children.some(c=>c.type==='workingNote')))fail();
  if(n.type==='account'&&(children.length!==2||children.some(c=>c.type!=='table'||!c.attrs?.caFormat)))fail();
  if(n.type==='table'&&a.caFormat&&(children.length>201||children.some(r=>(r.content??[]).reduce((n,c)=>n+(Number(c.attrs?.colspan)||1),0)>12)))throw Error('Use up to 200 line items and 12 columns per CA working. Split larger workings into separate tables.');
  if(mark&&(children.length||n.text))fail();
  for(const child of children){
   const ok=n.type==='doc'||['workingNote','blockquote','callout','toggle','listItem','taskItem','tableCell','tableHeader'].includes(n.type)?blocks.has(child.type):['paragraph','heading'].includes(n.type)?inline.has(child.type):n.type==='codeBlock'?child.type==='text':['bulletList','orderedList'].includes(n.type)?child.type==='listItem':n.type==='taskList'?child.type==='taskItem':n.type==='account'?child.type==='table':n.type==='table'?child.type==='tableRow':n.type==='tableRow'?['tableCell','tableHeader'].includes(child.type):false;
   if(!ok)fail();walk(child,depth+1);
  }
  if(['doc','table','tableRow','listItem','taskItem','tableCell','tableHeader','bulletList','orderedList','taskList','callout','toggle','blockquote'].includes(n.type)&&!children.length)fail();
 }
 if(d.content?.type!=='doc')fail();walk(d.content,0);if(textBytes>120000)throw Error('Note text is too large. Split it into smaller notes.');
 const l=d.layout;if(!l||(l.orientation!==undefined&&!['portrait','landscape'].includes(l.orientation))||(l.workingWidth!==undefined&&!['readable','wide','full'].includes(l.workingWidth))||(l.height!==undefined&&(!Number.isFinite(l.height)||l.height<100||l.height>420))||(l.language!==undefined&&!['en','hi','ur','ar'].includes(l.language))||!['continuous','page'].includes(l.mode)||!['a4','letter','custom'].includes(l.paper)||!Number.isFinite(l.width)||l.width<100||l.width>300||!Number.isFinite(l.margin)||l.margin<5||l.margin>40||typeof l.header!=='string'||l.header.length>160||typeof l.footer!=='string'||l.footer.length>160||typeof l.pageNumbers!=='boolean')fail();
 if(l.lines!==undefined&&!validPaperLines(l.lines))fail();
 if(l.pageLines!==undefined&&(!l.pageLines||typeof l.pageLines!=='object'||Array.isArray(l.pageLines)||Object.keys(l.pageLines).length>500||Object.entries(l.pageLines).some(([key,value])=>!/^([1-9]\d{0,3})$/.test(key)||Number(key)>5000||!validPaperLines(value))))fail();
 if(d.legacyHtml!==undefined&&(typeof d.legacyHtml!=='string'||new TextEncoder().encode(d.legacyHtml).length>200000))fail();
 return d;
}
export function renderStructuredNote(d:StructuredNote){
 validateStructuredNote(d);
 function render(n:NoteNode,inherited?:FinancialConfig):string{
  const a=n.attrs??{},cfg=n.type==='table'&&a.caFormat?financialConfig(a.caFormat):inherited;let content=n.content??[];if(n.type==='tableCell'&&cfg&&['amount','number','percent'].includes(String(a.caKind))){const raw=rawAmount(n,cfg.number);if(raw!==null&&raw!=='')content=numberCell(n,raw,cfg).content??content;}const children=content.map(c=>render(c,cfg)).join('');
  let style='';if(a.caRole==='section')style+='font-weight:700;';if(a.caRole==='working')style+='font-style:italic;';if(a.caRole==='subtotal')style+='font-weight:650;border-top:2px solid #94a3b8;';if(a.caWidth)style+=`width:${Number(a.caWidth)}%;`;if(a.caHeight)style+=`height:${Number(a.caHeight)}px;`;if(a.caFill)style+=`background-color:${a.caFill};`;if(a.caBorder)style+=`border-color:${a.caBorder};`;if(n.type!=='diagram'&&(a.textAlign||a.align))style+=`text-align:${a.textAlign??a.align};`;if(a.lineHeight)style+=`line-height:${a.lineHeight};`;if(a.indent)style+=`margin-left:${Number(a.indent)*24}px;`;
  if(['amount','number','percent'].includes(String(a.caKind))&&n.type==='tableCell')style+='text-align:right;font-variant-numeric:tabular-nums;';
  const attrs=`${a.caRole?` data-ca-role="${esc(a.caRole)}"`:''}${a.caKind?` data-ca-kind="${esc(a.caKind)}"`:''}${a.dir?` dir="${esc(a.dir)}"`:''}${a.blockId?` id="${esc(a.blockId)}"`:''}${style?` style="${style}"`:''}`;
  if(n.type==='text'){let s=esc(n.text);for(const m of n.marks??[]){const ma=m.attrs??{};const tag=({bold:'strong',italic:'em',underline:'u',strike:'s',subscript:'sub',superscript:'sup',code:'code'}as Record<string,string>)[m.type];if(tag)s=`<${tag}>${s}</${tag}>`;else if(m.type==='link')s=`<a href="${esc(ma.href)}" rel="noopener noreferrer">${s}</a>`;else if(m.type==='highlight')s=`<mark${ma.color?` style="background-color:${ma.color}"`:''}>${s}</mark>`;else if(m.type==='textStyle')s=`<span style="${ma.color?`color:${ma.color};`:''}${ma.fontFamily?`font-family:${esc(ma.fontFamily)};`:''}${ma.fontSize?`font-size:${ma.fontSize};`:''}">${s}</span>`;}return s;}
  const tags:Record<string,string>={paragraph:'p',heading:`h${a.level??2}`,bulletList:'ul',orderedList:'ol',listItem:'li',taskList:'ul',taskItem:'li',blockquote:'blockquote',table:'table',tableRow:'tr',tableCell:'td',tableHeader:'th',callout:'aside'};
  if(n.type==='doc')return children;
  if(n.type==='workingNote')return `<section${attrs} class="note-working" data-working-note="1" data-working-number="${a.number}"><header>Working note ${a.number}${(a.backlinks as string[]??[]).map((id,i)=>` <a class="note-working-backlink" href="#${esc(id)}">Back to answer${i?' '+(i+1):''}</a>`).join('')}</header><div class="note-working-body">${children}</div></section>`;
  if(n.type==='account')return `<div${attrs} data-ca-account="1" class="note-account" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start">${children}</div>`;
  if(n.type==='table'&&a.caFormat){const cfg=financialConfig(a.caFormat),widths=(n.content?.[0]?.content??[]).flatMap(c=>Array.from({length:Number(c.attrs?.colspan)||1},(_,i)=>Number((c.attrs?.colwidth as number[]|undefined)?.[i])||120)),totalWidth=widths.reduce((a,b)=>a+b,0),colgroup=n.content?.[0]?.content?.some(c=>c.attrs?.colwidth)?'<colgroup>'+widths.map(w=>`<col style="width:${(w/totalWidth*100).toFixed(3)}%">`).join('')+'</colgroup>':'';return `<table${attrs} class="note-financial-table" data-ca-borders="${cfg.borders}" data-ca-density="${cfg.density}">${colgroup}${n.content?.[0]?.content?.every(c=>c.type==='tableHeader')?`<thead>${render(n.content[0],cfg)}</thead><tbody>${n.content.slice(1).map(r=>render(r,cfg)).join('')}</tbody>`:children}</table>${totalsStale(n)?'<p class="note-total-warning">Totals need recalculation.</p>':''}`;}
  if(n.type==='ink')return `<figure class="note-ink-output"${attrs} style="width:${Number(a.width)||100}%;max-width:100%;break-inside:avoid"><figcaption>${esc(a.label)}</figcaption>${renderInk(parseInk(a.data),String(a.label))}</figure>`;
  if(n.type==='diagram')return `<figure class="note-diagram"${attrs} style="width:${Number(a.width)||100}%;max-width:100%;margin-left:${a.align==='right'||a.align==='center'?'auto':'0'};margin-right:${a.align==='left'||!a.align||a.align==='center'?'auto':'0'}"><figcaption>${esc(a.title)}</figcaption><div class="note-diagram-graphic"${a.height?` style="height:${Number(a.height)}px"`:''}>${renderDiagram(String(a.kind),String(a.data),String(a.title),String(a.variant))}</div><details><summary>Chart data</summary><pre>${esc(a.data)}</pre></details></figure>`;
  if(n.type==='hardBreak')return '<br>';
  if(n.type==='horizontalRule')return `<hr${attrs}>`;
  if(n.type==='pageBreak')return `<hr${attrs} class="note-page-break">`;
  if(n.type==='codeBlock')return `<pre${attrs}><code>${children}</code></pre>`;
  if(n.type==='math')return `<span class="note-math" data-expression="${esc(a.expression)}" role="math">${esc(a.expression)}</span>`;
  if(n.type==='attachment')return `<a class="note-attachment" href="/resources/${esc(a.resourceId)}">${esc(a.label??'Attached file')}</a>`;
  if(n.type==='reference')return `<a${a.blockId?` id="${esc(a.blockId)}"`:''}${a.workingTarget?` data-working-target="${esc(a.workingTarget)}"`:''} class="note-reference" href="${esc(a.href)}" rel="noopener noreferrer">[${esc(a.label)}]</a>`;
  if(n.type==='image')return `<span class="note-image" style="display:block;width:${Number(a.width)||100}%;max-width:100%;margin-left:${a.align==='right'||a.align==='center'?'auto':'0'};margin-right:${a.align==='right'?'0':'auto'}"><img src="${esc(a.src)}" alt="${esc(a.alt)}" title="${esc(a.caption??a.title)}" style="width:100%;${a.height?`height:${Number(a.height)}px;`:''}object-fit:${a.crop==='cover'?'cover':'contain'}" loading="lazy">${a.caption?`<span class="note-image-caption">${esc(a.caption)}</span>`:''}</span>`;
  if(n.type==='toggle')return `<details${attrs}${a.open?' open':''}><summary>${esc(a.summary??'Details')}</summary>${children}</details>`;
  const tag=tags[n.type];return `<${tag}${attrs}${n.type==='taskList'?' data-type="taskList"':''}${n.type==='taskItem'?` data-checked="${a.checked===true}"`:''}${['tableCell','tableHeader'].includes(n.type)?` colspan="${Number(a.colspan)||1}" rowspan="${Number(a.rowspan)||1}"`:''}${n.type==='orderedList'?` start="${Number(a.start)||1}"`:''}>${n.type==='taskItem'?(a.checked?'☑ ':'☐ '):''}${children}</${tag}>`;
 }
 const html=render(normalizeWorkingNotes(d.content));if(new TextEncoder().encode(html).length>200000)throw Error('Rendered note is too large. Split it into smaller notes.');return html;
}
export function readStructuredNote(json:string|null|undefined){if(!json)return null;try{const d=JSON.parse(json);return d.engine==='tiptap'?validateStructuredNote(d):null;}catch{return null;}}
