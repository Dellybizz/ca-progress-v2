import katex from 'katex';
import {notePageSize,type NoteLayout} from './structured-document';
import {PAGE_GAP,paperBackground,paperLinesFor,registerGeometry,pageCountFromWidth} from './page-paper';
/** Print uses the same column geometry as authoring, with one clipped column per sheet. */
export async function printRegisterNote(html:string,title:string,layout:NoteLayout,language:string){
 const frame=document.createElement('iframe');frame.className='note-print-frame';frame.title='Print note';document.body.append(frame);
 try{
  const doc=frame.contentDocument!,size=notePageSize(layout),g=registerGeometry(size.width,size.height,layout.margin);doc.open();doc.write('<!doctype html><html><head></head><body></body></html>');doc.close();doc.documentElement.lang=language;doc.title=title;
  const ready:Promise<void>[]=[];for(const stylesheet of Array.from(document.querySelectorAll('link[rel="stylesheet"],style'))){const clone=stylesheet.cloneNode(true) as HTMLElement;if(clone instanceof HTMLLinkElement){clone.href=(stylesheet as HTMLLinkElement).href;ready.push(new Promise(resolve=>{clone.onload=()=>resolve();clone.onerror=()=>resolve();}));}doc.head.append(clone);}
  const typography=getComputedStyle(document.querySelector('.note-document')??document.body);
  const style=doc.createElement('style');style.textContent=`@page{size:${size.width}mm ${size.height}mm;margin:0}html,body{margin:0!important;padding:0!important;background:white!important;color:#172033!important}body{font-family:Arial,'Noto Sans Devanagari',sans-serif;--register-width:${g.width}px;--register-height:${g.height}px;--register-margin:${g.margin}px;--register-inner-width:${g.innerWidth}px;--register-inner-height:${g.innerHeight}px;--register-gap:${PAGE_GAP}px}.note-register-print-flow{font-family:${typography.fontFamily};font-size:${typography.fontSize};line-height:${typography.lineHeight}}.note-register-print-flow table{border-collapse:collapse;width:100%;table-layout:fixed}.note-register-print-flow :is(td,th){overflow-wrap:anywhere}.note-register-print-flow .note-account{break-inside:auto}.note-register-print-flow .note-diagram details{display:none}.note-register-print-flow .note-diagram-graphic{height:auto!important;overflow:visible!important}.note-register-print-flow svg{max-height:${g.innerHeight-50}px!important;width:100%;height:auto}.note-register-print-flow .note-page-break{break-before:column}.note-register-print-flow :is(img,svg){break-inside:avoid}`;doc.head.append(style);
  const flow=doc.createElement('article');flow.className='note-register-print-flow note-rich-content';flow.innerHTML=html;doc.body.append(flow);for(const math of Array.from(flow.querySelectorAll<HTMLElement>('[data-expression]')))katex.render(math.dataset.expression??'',math,{throwOnError:false,trust:false,strict:'ignore'});
  await Promise.all(ready);await doc.fonts.ready;await Promise.all(Array.from(doc.images).map(img=>{img.loading='eager';return img.decode().catch(()=>{});}));
  const count=pageCountFromWidth(flow.scrollWidth,g.innerWidth,g.stride);flow.remove();
  for(let page=1;page<=count;page++){
   const sheet=doc.createElement('section');sheet.className='note-register-print-sheet';const paper=doc.createElement('div');paper.className='note-register-sheet';const lines=paperLinesFor(layout,page);
   if(lines.print){const ruling=doc.createElement('div');ruling.className='note-register-ruling';ruling.style.backgroundImage=paperBackground(lines);paper.append(ruling);if(lines.marginLine){const margin=doc.createElement('span');margin.className='note-register-margin-line';paper.append(margin);}}
   const header=doc.createElement('header');header.textContent=layout.header;const footer=doc.createElement('footer'),left=doc.createElement('span');left.textContent=layout.footer;footer.append(left);if(layout.pageNumbers){const n=doc.createElement('span');n.textContent=String(page);footer.append(n);}paper.append(header,footer);
   const crop=doc.createElement('div');crop.className='note-register-print-crop';const copy=flow.cloneNode(true) as HTMLElement;copy.style.setProperty('--register-offset',`${-(page-1)*g.stride}px`);crop.append(copy);sheet.append(paper,crop);doc.body.append(sheet);
  }
  await doc.fonts.ready;await new Promise<void>(resolve=>frame.contentWindow!.requestAnimationFrame(()=>resolve()));doc.body.dataset.notePrintReady='true';frame.contentWindow?.focus();frame.contentWindow?.print();window.setTimeout(()=>frame.remove(),60000);
 }catch(error){frame.remove();throw error;}
}
