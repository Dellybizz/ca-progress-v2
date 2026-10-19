import type {Metadata} from 'next';
import {WelcomeEntry} from '@/components/auth/onboarding/welcome-entry';
import {sanitizeReturnPath} from '@/lib/auth/navigation';
export const metadata:Metadata={title:'Welcome | CA Progress'};
export default async function WelcomePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const next=sanitizeReturnPath(typeof params.next==='string'?params.next:null,'/onboarding');
 return <WelcomeEntry next={next}/>;
}
