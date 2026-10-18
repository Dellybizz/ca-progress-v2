import type {NoteLayout} from './structured-document';
export type PaperLines={style:'plain'|'ruled'|'narrow'|'squared'|'dotted';spacing:number;color:string;opacity:number;marginLine:boolean;print:boolean};
export const DEFAULT_PAPER_LINES:PaperLines={style:'plain',spacing:8,color:'#94a3b8',opacity:35,marginLine:false,print:false};
export function validPaperLines(value:unknown):value is PaperLines{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const p=value as PaperLines;
 return Object.keys(p).every(k=>['style','spacing','color','opacity','marginLine','print'].includes(k))&&['plain','ruled','narrow','squared','dotted'].includes(p.style)&&Number.isFinite(p.spacing)&&p.spacing>=4&&p.spacing<=14&&/^#[0-9a-f]{6}$/i.test(p.color)&&Number.isInteger(p.opacity)&&p.opacity>=10&&p.opacity<=80&&typeof p.marginLine==='boolean'&&typeof p.print==='boolean';
}
export function paperLinesFor(layout:NoteLayout,page:number):PaperLines{return layout.pageLines?.[String(page)]??layout.lines??DEFAULT_PAPER_LINES;}
/** Values are validated before use in CSS or SVG. */
export function paperBackground(p:PaperLines){
 if(!validPaperLines(p))throw Error('Invalid paper lines.');
 const size=(p.style==='narrow'?Math.min(p.spacing,6):p.spacing)*96/25.4,ink=p.color,opacity=p.opacity/100;
 const mark=p.style==='dotted'?`<circle cx="1" cy="1" r="0.8" fill="${ink}" fill-opacity="${opacity}"/>`:p.style==='plain'?'':`<path d="M0 ${size-.5}H${size}${p.style==='squared'?`M${size-.5} 0V${size}`:''}" fill="none" stroke="${ink}" stroke-opacity="${opacity}" stroke-width="0.7"/>`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${mark}</svg>`;
 return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
export const PAGE_GAP=20;
export function registerGeometry(width:number,height:number,margin:number){const unit=96/25.4;return {width:width*unit,height:height*unit,margin:margin*unit,innerWidth:(width-2*margin)*unit,innerHeight:(height-2*margin)*unit,stride:width*unit+PAGE_GAP};}
export function pageCountFromWidth(scrollWidth:number,innerWidth:number,stride:number){return Math.max(1,1+Math.ceil(Math.max(0,scrollWidth-innerWidth-2)/stride));}
export function spreadStart(page:number,spread:number){return Math.floor((page-1)/spread)*spread+1;}
