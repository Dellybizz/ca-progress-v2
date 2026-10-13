import {SetupRequestError, type SetupDraft} from './setup-contract';

type SetupReply = {ok: true; revision?: number; alreadyCompleted?: boolean; completed?: boolean};
export async function sendSetupRequest(accountId: string, draft: SetupDraft, revision: number, action: 'draft' | 'complete', fetcher: typeof fetch = fetch): Promise<SetupReply> {
  let response: Response;
  try {
    response = await fetcher('/api/v1/onboarding', {
      method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({schemaVersion: 2, ownerId: accountId, action, draft, revision}),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SetupRequestError('Could not confirm the save. Your choices are still here. Check your connection and try again.', 0);
  }
  const result = await response.json().catch(() => null) as (SetupReply & {error?: string}) | null;
  const acknowledged = result?.alreadyCompleted === true || (action === 'complete'
    ? result?.completed === true
    : typeof result?.revision === 'number' && Number.isSafeInteger(result.revision) && result.revision > revision);
  if (!response.ok || result?.ok !== true || !acknowledged) {
    throw new SetupRequestError(typeof result?.error === 'string' ? result.error : 'Could not confirm the save. Your choices are still here. Try again.', response.status);
  }
  return result;
}
