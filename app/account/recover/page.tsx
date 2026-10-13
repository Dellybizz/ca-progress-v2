import {RecoveryEntry} from '@/components/auth/onboarding/recovery-entry';
export const dynamic='force-dynamic';
export const metadata={title:'Recover your login'};
export default async function RecoverPage({searchParams}:{searchParams:Promise<{error?:string}>}){const params=await searchParams;return <RecoveryEntry error={params.error?'We could not verify this reset. Try again with the account already linked to CA Progress.':''}/>;}
