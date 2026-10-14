'use client';
import { StudentContextProvider } from '@/components/academic/student-context-provider';
import { ResourceLibrary } from './resource-library';
import { ResourceHubTabs } from './resource-hub-tabs';
import type { StudentContextContract } from '@/lib/academic/student-context';
const context:StudentContextContract={contractVersion:1,mode:'guest',userId:null,displayName:'Sample student',role:'student',entitlements:[],timezone:'Asia/Kolkata',dailyTargetMinutes:120,locale:'en-IN',selection:null,levelId:null,groupIds:[],subjectIds:[],syllabusVersionIds:[],contextKey:'layout-preview',issue:null};
export function ResourceLayoutSample() {
  return <StudentContextProvider value={context}><div style={{padding:12}}><p>Sample resources · preview only</p><div inert className="resource-hub"><header className="resource-hub-heading"><div><h1>Resources</h1><p>Notes, files and official material, together.</p></div></header><ResourceHubTabs tab="my" params={{}}/><ResourceLibrary hideTabs model={{mode:'ready',viewerName:'Sample student',subjects:[],myNotes:[],myUploads:[],sharedNotes:[],sharedUploads:[],officialResources:[]}}/></div></div></StudentContextProvider>;
}
