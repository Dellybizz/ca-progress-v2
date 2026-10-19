import {OnboardingLayoutPreview} from '@/components/auth/onboarding/layout-preview';
export const metadata={title:'Onboarding responsive preview'};
export default async function Page({searchParams}:{searchParams:Promise<{frame?:string;screen?:string}>}){
 const params=await searchParams;
 return <OnboardingLayoutPreview embedded={params.frame==='1'} screen={params.screen}/>;
}
