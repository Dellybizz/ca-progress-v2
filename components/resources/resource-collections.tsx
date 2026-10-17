'use client';
import {useSyncExternalStore} from 'react';
import {ResourceLibrary} from './resource-library';
import {IcaiResourceBrowser} from '@/components/icai/resource-browser';
import type {ResourceLibraryReady} from '@/lib/resources/types';
import type {IcaiPublicCatalog} from '@/lib/icai/types';
import {resourceTab,type ResourceTab} from '@/lib/resources/navigation';
const subscribe=(update:()=>void)=>{window.addEventListener('popstate',update);window.addEventListener('ca-files-navigation',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('ca-files-navigation',update);};};
/** All collection metadata arrives once; switching updates history and the canvas immediately. */
export function ResourceCollections({model,catalog,initialTab,initialAcademicContext,initialOfficialContext}:{model:ResourceLibraryReady;catalog:IcaiPublicCatalog;initialTab:ResourceTab;initialAcademicContext?:{subjectId?:string;chapterId?:string};initialOfficialContext?:{subject?:string;type?:string}}){
 const tab=useSyncExternalStore(subscribe,()=>resourceTab(new URLSearchParams(window.location.search).get('tab')),()=>initialTab);
 const requested=initialOfficialContext?.subject;
 const officialSubject=requested?(model.subjects.some(subject=>subject.id===requested)?requested:'__not_applicable__'):'';
 const officialCatalog={...catalog,filters:{...catalog.filters,subject:officialSubject,type:initialOfficialContext?.type??''}};
 return <div className="fm-collection-canvas" data-resource-collections>{tab==='icai'?<IcaiResourceBrowser catalog={officialCatalog} embedded scopeLocked/>:<ResourceLibrary key={tab} model={model} initialTab={tab} hideTabs initialAcademicContext={initialAcademicContext}/>}</div>;
}
