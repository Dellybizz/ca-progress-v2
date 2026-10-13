import {redirect} from 'next/navigation';
import {ResetEntry} from '@/components/auth/onboarding/recovery-entry';
import {passwordRecoveryState} from '@/lib/auth/password-recovery';
export const dynamic='force-dynamic';
export const metadata={title:'Reset your password'};
export default async function ResetPage(){const state=await passwordRecoveryState();if(!state)redirect('/account/recover?error=expired');return <ResetEntry username={state.username}/>;}
