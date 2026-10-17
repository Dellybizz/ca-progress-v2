import {redirect,notFound} from 'next/navigation';
import {RecoveryEntry,ResetEntry} from '@/components/auth/onboarding/recovery-entry';
import {passwordRecoveryState} from '@/lib/auth/password-recovery';
export const dynamic='force-dynamic';
export const metadata={title:'Recover your login'};
export default async function AccountRecoveryPage({params,searchParams}:{params:Promise<{flow:string}>;searchParams:Promise<{error?:string}>}){
 const {flow}=await params;
 if(flow==='recover'){const query=await searchParams;return <RecoveryEntry error={query.error?'We could not verify this reset. Try again with the account already linked to CA Progress.':''}/>;}
 if(flow!=='reset')notFound();
 const state=await passwordRecoveryState();if(!state)redirect('/account/recover?error=expired');return <ResetEntry username={state.username}/>;
}
