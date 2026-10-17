import "@/app/styles/notes-workspace.css";
import {redirect} from 'next/navigation';
import {LoginRequired} from '@/components/auth/login-required';
import {NoteEditor} from '@/components/resources/note-editor';
import {getResourceLibraryModel} from '@/lib/resources/service';
export const dynamic='force-dynamic';
export const metadata={title:'Create note | CA Progress'};
export default async function NewNotePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const model=await getResourceLibraryModel({includeOfficial:false,metadataOnly:true});
 if(model.mode==='setup')redirect('/onboarding?next=/notes/new');
 if(model.mode!=='ready')return <LoginRequired next="/notes/new" title="Sign in to create a note"/>;
 const subject=typeof params.subjectId==='string'?model.subjects.find(item=>item.id===params.subjectId):undefined;
 const chapter=typeof params.chapterId==='string'?subject?.chapters.find(item=>item.id===params.chapterId):undefined;
 return <div className="note-authoring-entry"><NoteEditor subjects={model.subjects} availableUploads={model.myUploads} initialSubjectId={subject?.id} initialChapterId={chapter?.id}/></div>;
}
