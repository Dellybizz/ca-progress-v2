import type { NoteCard, UploadCard } from './types';
export type LibraryEntry = {kind:'note';item:NoteCard} | {kind:'upload';item:UploadCard};
export function libraryPage(notes:NoteCard[],uploads:UploadCard[],{kind,sort,page,pageSize=24}:{kind:string;sort:string;page:number;pageSize?:number}) {
  const entries:LibraryEntry[] = [
    ...(kind==='files'?[]:notes.map(item=>({kind:'note' as const,item}))),
    ...(kind==='notes'?[]:uploads.map(item=>({kind:'upload' as const,item}))),
  ];
  entries.sort((a,b)=>sort==='title' ? a.item.title.localeCompare(b.item.title) || a.item.id.localeCompare(b.item.id) : (Date.parse(b.item.updatedAt)||0)-(Date.parse(a.item.updatedAt)||0) || a.item.id.localeCompare(b.item.id));
  const size=Math.max(1,Math.floor(pageSize));
  const pages=Math.max(1,Math.ceil(entries.length/size));
  const current=Math.max(1,Math.min(pages,Math.floor(page)||1));
  return {items:entries.slice((current-1)*size,current*size),count:entries.length,pages,current};
}
