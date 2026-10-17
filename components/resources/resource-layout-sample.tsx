'use client';
import {FileManager} from './file-manager';
import {ResourceHubTabs} from './resource-hub-tabs';
import type {ManagedFile,FileKind} from '@/lib/resources/file-manager';
function sample(id:string,name:string,kind:FileKind,extension:string,size:number|null):ManagedFile {
  return {key:id,id,name,filename:name+'.'+extension.toLowerCase(),kind,extension,size,modified:'2026-10-14T10:00:00Z',subjectIds:['accounting'],subject:'Advanced Accounting',chapterId:null,chapter:null,owner:'Sample student',status:'private',important:id==='pdf',excerpt:kind==='note'?'Recognition, measurement and presentation. Keep the core principles together for quick revision.':'Sample file for the layout preview.',href:'#',previewUrl:kind==='image'?'/resources-preview/study-diagram.svg':undefined};
}
export const sampleManagerFiles=[sample('note','Accounting standards — quick revision','note','NOTE',null),sample('pdf','Chapter 1 study material','pdf','PDF',2457600),sample('image','Framework mind map','image','PNG',486400),sample('word','Revision checklist','document','DOCX',32768),sample('link','ICAI reference material','link','LINK',null),sample('pdf2','Practice questions','pdf','PDF',1080000),sample('note2','Adjustments to remember','note','NOTE',null),sample('word2','Study plan','document','DOCX',16200)];
export function ResourceLayoutSample() {
  return <div style={{padding:12}}><p>Sample file manager · preview only</p><div className="resource-hub resource-workspace"><aside className="resource-workspace-sidebar" inert><div className="fm-sidebar-title">Workspace</div><ResourceHubTabs tab="my" params={{}}/></aside><div className="resource-workspace-content"><FileManager files={sampleManagerFiles} title="My files" preview/></div></div></div>;
}
