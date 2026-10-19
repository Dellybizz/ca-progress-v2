import {SetupPreview} from '@/components/auth/onboarding/setup-preview';
import {loadAttemptOptions} from '@/lib/auth/server';
export const dynamic='force-dynamic';
export const metadata={title:'Setup design preview'};
export default async function SetupPreviewPage(){return <SetupPreview attempts={await loadAttemptOptions()}/>;}
