import type {WorkspacePage} from './workspace';
import {DEFAULT_MANAGER_QUERY} from './workspace-navigation';
import type {ManagerQuery} from './workspace-foundation';
import {sortFiles} from './file-manager';

const pages=new Map<string,{data:WorkspacePage;at:number}>();
const requests=new Map<string,Promise<WorkspacePage>>();
const generations=new Map<string,number>();
const MAX_PAGES=48,FRESH_MS=15000;
export function workspaceRequestUrl(collection:string,view:string,folder:string,query:ManagerQuery,cursor='',filesOnly=false){
 const p=new URLSearchParams({collection,view,folder});if(filesOnly)p.set('filesOnly','true');
 for(const [key,value] of Object.entries({...DEFAULT_MANAGER_QUERY,...query}))p.set(key==='query'?'q':key,Array.isArray(value)?value.join(','):String(value));
 if(cursor)p.set('cursor',cursor);return `/api/v1/resources/workspace?${p}`;
}
const keyFor=(scope:string,url:string)=>JSON.stringify([scope,url]);
export function peekWorkspacePage(scope:string,url:string){return typeof window==='undefined'?undefined:pages.get(keyFor(scope,url));}
export function canRestoreWorkspaceSnapshot(scope:string){return !generations.has(scope);}
/** A complete unfiltered page can paint simple filters before the authoritative response. */
export function previewWorkspacePage(scope:string,url:string):WorkspacePage|undefined{
 if(typeof window==='undefined')return;const target=new URL(url,'https://workspace.invalid').searchParams;
 if(target.get('q')||target.get('tag')||target.get('cursor'))return;
 for(const [key,entry] of [...pages].reverse()){
  const [owner,source]=JSON.parse(key);if(owner!==scope||Date.now()-entry.at>FRESH_MS||entry.data.nextCursor||entry.data.total!==entry.data.files.length)continue;
  const p=new URL(source,'https://workspace.invalid').searchParams;
  if(['collection','view','folder','filesOnly'].some(field=>p.get(field)!==target.get(field))||['q','types','subjectId','chapterId','tag','status','owner','after','before','cursor'].some(field=>p.get(field))||p.get('important')==='true')continue;
  const types=(target.get('types')??'').split(',').filter(Boolean);
  const files=entry.data.files.filter(file=>(!types.length||types.includes(file.kind))&&(target.get('important')!=='true'||file.important)&&(!target.get('subjectId')||file.subjectIds.includes(target.get('subjectId')!))&&(!target.get('chapterId')||file.chapterId===target.get('chapterId'))&&(!target.get('status')||file.status===target.get('status'))&&(!target.get('owner')||file.owner.toLowerCase().includes(target.get('owner')!.toLowerCase()))&&(!target.get('after')||file.modified.slice(0,10)>=target.get('after')!)&&(!target.get('before')||file.modified.slice(0,10)<=target.get('before')!));
  const query={...DEFAULT_MANAGER_QUERY,...Object.fromEntries(target)} as ManagerQuery;
  const sorted=sortFiles(files,query.sort,query.direction,query.secondary);return {...entry.data,files:sorted.slice(0,Number(target.get('limit')??24)),total:sorted.length};
 }
}
export function invalidateWorkspacePages(scope:string){
 generations.set(scope,(generations.get(scope)??0)+1);
 for(const key of pages.keys())if(JSON.parse(key)[0]===scope)pages.delete(key);
 for(const key of requests.keys())if(JSON.parse(key)[0]===scope)requests.delete(key);
}
/** Private session memory only: never a shared server or public HTTP cache. */
export function loadWorkspacePage(scope:string,url:string,force=false):Promise<WorkspacePage>{
 const key=keyFor(scope,url),cached=peekWorkspacePage(scope,url);
 if(!force&&cached&&Date.now()-cached.at<FRESH_MS)return Promise.resolve(cached.data);
 const pending=requests.get(key);if(pending)return pending;
 const generation=generations.get(scope)??0;
 const request=fetch(url,{cache:'no-store'}).then(async response=>{
  const payload=await response.json();if(!response.ok){if(response.status===401||response.status===403)invalidateWorkspacePages(scope);throw Error(payload.error??'Files could not be loaded.');}
  if(generation!==(generations.get(scope)??0))return loadWorkspacePage(scope,url,true);
  pages.delete(key);pages.set(key,{data:payload as WorkspacePage,at:Date.now()});
  while(pages.size>MAX_PAGES)pages.delete(pages.keys().next().value!);
  return payload as WorkspacePage;
 }).finally(()=>{if(requests.get(key)===request)requests.delete(key);});
 requests.set(key,request);return request;
}
