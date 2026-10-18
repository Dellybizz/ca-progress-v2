'use client';
import {useEffect,useRef} from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/700.css';
import '@/app/styles/notes-editor.css';
import '@/app/styles/notes-layout-repair.css';
export function NoteReader({html}:{html:string}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{for(const node of root.current?.querySelectorAll<HTMLElement>('[data-expression]')??[])katex.render(node.dataset.expression??'',node,{throwOnError:false,trust:false,strict:'ignore'});},[html]);
 return <div ref={root} className="note-reader note-document" dangerouslySetInnerHTML={{__html:html}}/>;
}
