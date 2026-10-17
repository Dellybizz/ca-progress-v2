import "@/app/styles/notes-workspace.css";
import {NoteEditor} from '@/components/resources/note-editor';
import {redirect} from 'next/navigation';
import {LoginRequired} from '@/components/auth/login-required';
import {getResourceLibraryModel} from '@/lib/resources/service';
import {getCommunityNoteDraftForViewer} from '@/lib/notes/phase6';
export const dynamic='force-dynamic';
export default async function NotesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;const text=(key:string)=>typeof params[key]==='string'?params[key] as string:undefined;
 if(!text('communityMessageId')){const query=new URLSearchParams();for(const key of ['subjectId','chapterId'])if(text(key))query.set(key,text(key)!);redirect(`/notes/new${query.size?'?'+query:''}`);}
 const [model,draft]=await Promise.all([getResourceLibraryModel({includeOfficial:false,metadataOnly:true}),getCommunityNoteDraftForViewer(text('communityMessageId'))]);
 if(model.mode==='setup')redirect('/onboarding?next=/notes');
 return model.mode==='ready'?<div className="note-authoring-entry"><NoteEditor subjects={model.subjects} communityDraft={draft} initialSubjectId={text('subjectId')} initialChapterId={text('chapterId')}/></div>:<LoginRequired next="/notes" title="Sign in to open your notes"/>;
}
