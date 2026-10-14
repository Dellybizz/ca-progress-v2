import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StorageCleanupWarning } from '@/components/billing/storage-cleanup-warning';
import { LoginRequired } from '@/components/auth/login-required';
import { ResourceLibrary } from '@/components/resources/resource-library';
import { ResourceHubTabs } from '@/components/resources/resource-hub-tabs';
import { IcaiResourceBrowser } from '@/components/icai/resource-browser';
import { OfflineSnapshot } from '@/components/offline/offline-snapshot';
import { getResourceLibraryModel } from '@/lib/resources/service';
import { getCommunityNoteDraftForViewer } from '@/lib/notes/phase6';
import { getStudentContext } from '@/lib/academic/student-context';
import { getIcaiPublicCatalog } from '@/lib/icai/query';
import { resourceDestination, resourceTab } from '@/lib/resources/navigation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {title:'Resources | CA Progress'};
const param = (value:string|string[]|undefined) => typeof value === 'string' ? value : undefined;

export default async function ResourcesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params = await searchParams;
  const tab = param(params.communityMessageId) ? 'my' : resourceTab(param(params.tab));
  let content;
  if (tab === 'icai') {
    const context = await getStudentContext();
    const selection = context.mode === 'ready' ? context.selection : null;
    const requestedSubject = param(params.subject) ?? param(params.subjectId);
    const catalog = await getIcaiPublicCatalog({
      level: selection?.level ?? param(params.level),
      attempt: selection?.attemptKey ?? param(params.attempt),
      subject: selection && requestedSubject && !context.subjectIds.includes(requestedSubject) ? '__not_applicable__' : requestedSubject,
      type: param(params.type),
    });
    content = <IcaiResourceBrowser catalog={catalog} embedded scopeLocked={Boolean(selection)}/>;
  } else {
    const [model,communityDraft] = await Promise.all([
      getResourceLibraryModel({includeOfficial:false,metadataOnly:true}),
      tab === 'my' ? getCommunityNoteDraftForViewer(param(params.communityMessageId)) : Promise.resolve(null),
    ]);
    if (model.mode === 'setup') redirect('/onboarding?next=/resources');
    content = model.mode === 'ready' ? <>
      <OfflineSnapshot kind="resources" data={model}/>
      <StorageCleanupWarning/>
      <ResourceLibrary key={tab} model={model} initialTab={tab} hideTabs initialAcademicContext={{subjectId:param(params.subjectId),chapterId:param(params.chapterId)}} initialCommunityDraft={communityDraft}/>
    </> : <div className="resource-hub-guest"><LoginRequired next={resourceDestination(params,tab)} title="Sign in to open your library"/><p>Official study material is available without signing in. <Link href={resourceDestination(params,'icai')}>Browse ICAI resources →</Link></p></div>;
  }
  return <div className="resource-hub resource-workspace"><aside className="resource-workspace-sidebar"><div className="fm-sidebar-title"><span>Workspace</span></div><ResourceHubTabs tab={tab} params={params}/><Link href="/updates" className="fm-updates-link">ICAI updates ↗</Link></aside><div className="resource-workspace-content">{content}</div></div>;
}
