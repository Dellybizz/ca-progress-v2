import {normalizeWorkspaceLocation,type WorkspaceLocation,type ManagerQuery} from './workspace-foundation';
const kinds=['note','pdf','image','document','link','other'];
const sorts=['name','modified','size','type'];
export const DEFAULT_MANAGER_QUERY:ManagerQuery={query:'',types:[],sort:'modified',secondary:'name',direction:'desc',subjectId:'',chapterId:'',important:false,limit:24,group:'none',tag:'',status:'',owner:'',after:'',before:''};
export function readWorkspaceNavigation(search:string,collection:'my'|'shared'):{location:WorkspaceLocation;query:ManagerQuery}{
 const p=new URLSearchParams(search);
 const location=normalizeWorkspaceLocation({collection,view:p.get('fmView') as WorkspaceLocation['view'],folder:p.get('fmFolder')??'',layout:p.get('fmLayout') as WorkspaceLocation['layout']});
 const text=(key:string,max:number)=> (p.get(`fm_${key}`)??'').slice(0,max);
 const subjectId=text('subjectId',200);
 const query:ManagerQuery={...DEFAULT_MANAGER_QUERY,query:text('query',500),types:[...new Set(text('types',120).split(',').filter(value=>kinds.includes(value)))] as ManagerQuery['types'],sort:sorts.includes(text('sort',20))?text('sort',20) as ManagerQuery['sort']:'modified',secondary:['none',...sorts].includes(text('secondary',20))?text('secondary',20) as ManagerQuery['secondary']:'name',direction:text('direction',4)==='asc'?'asc':'desc',subjectId,chapterId:subjectId?text('chapterId',200):'',important:text('important',5)==='true',limit:[24,48,96].includes(Number(text('limit',3)))?Number(text('limit',3)):24,group:['type','subject'].includes(text('group',10))?text('group',10) as ManagerQuery['group']:'none'};
 for(const key of ['tag','status','owner','after','before'] as const)query[key]=text(key,key==='owner'?80:32);
 return{location,query};
}
/** Keep host page parameters (tab, academic deep links) and never serialize transient IDs. */
export function writeWorkspaceNavigation(search:string,location:WorkspaceLocation,query:ManagerQuery):string{
 const p=new URLSearchParams(search);const normalized=normalizeWorkspaceLocation(location);
 p.set('fmView',normalized.view);if(normalized.folder)p.set('fmFolder',normalized.folder);else p.delete('fmFolder');
 p.set('fmLayout',normalized.layout);
 for(const key of Object.keys(DEFAULT_MANAGER_QUERY) as (keyof ManagerQuery)[]){const value=query[key];const encoded=Array.isArray(value)?value.join(','):String(value??'');const defaultValue=DEFAULT_MANAGER_QUERY[key];const defaultEncoded=Array.isArray(defaultValue)?defaultValue.join(','):String(defaultValue??'');if(encoded===defaultEncoded)p.delete(`fm_${key}`);else p.set(`fm_${key}`,encoded);}
 return p.toString();
}
export function workspacePreferenceKey(ownerId:string,contextKey:string):string{return `ca-files-preferences:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(contextKey)}`;}
