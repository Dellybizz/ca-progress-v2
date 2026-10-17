import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StorageCleanupWarning } from '@/components/billing/storage-cleanup-warning';
import { LoginRequired } from '@/components/auth/login-required';
import { ResourceCollections } from '@/components/resources/resource-collections';
import {ResourceViewport} from '@/components/resources/resource-viewport';
import { ResourceHubTabs } from '@/components/resources/resource-hub-tabs';
import { IcaiResourceBrowser } from '@/components/icai/resource-browser';
import { OfflineSnapshot } from '@/components/offline/offline-snapshot';
import { getResourceLibraryModel } from '@/lib/resources/service';
import { getStudentContext } from '@/lib/academic/student-context';
import { getIcaiPublicCatalog } from '@/lib/icai/query';
import { resourceDestination, resourceTab } from '@/lib/resources/navigation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {title:'Resources | CA Progress'};
const param = (value:string|string[]|undefined) => typeof value === 'string' ? value : undefined;

export default async function ResourcesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params = await searchParams;
  if(param(params.communityMessageId)){const next=new URLSearchParams();for(const [key,value] of Object.entries(params))if(typeof value==='string')next.set(key,value);redirect(`/notes?${next}`);}
  const tab = param(params.communityMessageId) ? 'my' : resourceTab(param(params.tab));
  const [context,model]=await Promise.all([getStudentContext(),getResourceLibraryModel({includeOfficial:false,metadataOnly:true})]);
  if(model.mode==='setup'&&tab!=='icai')redirect('/onboarding?next=/resources');
  const selection=context.mode==='ready'?context.selection:null;
  const requestedSubject=param(params.subject)??param(params.subjectId);
  const catalog=await getIcaiPublicCatalog({
    level:selection?.level??param(params.level),attempt:selection?.attemptKey??param(params.attempt),
    subject:model.mode==='ready'?undefined:selection&&requestedSubject&&!context.subjectIds.includes(requestedSubject)?'__not_applicable__':requestedSubject,
    type:model.mode==='ready'?undefined:param(params.type),
  });
  const content=model.mode==='ready'?<>
    <OfflineSnapshot kind="resources" data={model}/><StorageCleanupWarning/>
    <ResourceCollections model={model} catalog={catalog} initialTab={tab} initialAcademicContext={{subjectId:param(params.subjectId),chapterId:param(params.chapterId)}} initialOfficialContext={{subject:requestedSubject,type:param(params.type)}}/>
  </>:tab==='icai'?<IcaiResourceBrowser catalog={catalog} embedded scopeLocked={Boolean(selection)}/>:<div className="resource-hub-guest"><LoginRequired next={resourceDestination(params,tab)} title="Sign in to open your library"/><p>Official study material is available without signing in. <Link href={resourceDestination(params,'icai')}>Browse ICAI resources →</Link></p></div>;
  return <div className="resource-hub resource-workspace"><ResourceViewport/><aside className="resource-workspace-sidebar"><div className="fm-sidebar-title"><span>Workspace</span></div><ResourceHubTabs tab={tab} params={params}/><div id="fm-view-navigation"/><Link href="/updates" className="fm-updates-link">ICAI updates ↗</Link></aside><div className="resource-workspace-content">{content}</div><div id="fm-utility-dock" className="fm-utility-dock"/></div>;
}
