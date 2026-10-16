import {OfflineSnapshot} from '@/components/offline/offline-snapshot';
import {redirect} from 'next/navigation';
import {ResourceLibrary} from '@/components/resources/resource-library';
import {LoginRequired} from '@/components/auth/login-required';
import {getResourceLibraryModel} from '@/lib/resources/service';
import {getCommunityNoteDraftForViewer} from '@/lib/notes/phase6';
export const dynamic='force-dynamic';
export default async function NotesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;const text=(key:string)=>typeof params[key]==='string'?params[key] as string:undefined;
 const [model,draft]=await Promise.all([getResourceLibraryModel({includeOfficial:false}),getCommunityNoteDraftForViewer(text('communityMessageId'))]);
 if(model.mode==='setup')redirect('/onboarding?next=/notes');
 return model.mode==='ready'?<><OfflineSnapshot kind="notes" data={model}/><ResourceLibrary model={model} initialCommunityDraft={draft} initialAcademicContext={{subjectId:text('subjectId'),chapterId:text('chapterId')}}/></>:<LoginRequired next="/notes" title="Sign in to open your notes"/>;
}
