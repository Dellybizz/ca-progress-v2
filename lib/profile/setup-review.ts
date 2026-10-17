import {setupReadiness, type SetupDraft, type SetupStep} from './setup-contract';
import type {AttemptOption} from './validation';
import {sanitizeReturnPath} from '../auth/navigation';

export type ReviewEditStep = Exclude<SetupStep, 'intro' | 'progress' | 'review'>;
export function startReviewEdit(draft: SetupDraft, step: ReviewEditStep) {
  if (draft.step !== 'review' || (step === 'group' && draft.level === 'foundation')) return null;
  return {snapshot: {...draft, support: [...draft.support]}, draft: {...draft, step, support: [...draft.support]}};
}
/** Only revisit prerequisites invalidated by the edit, keeping other answers. */
export function reviewEditDestination(draft: SetupDraft, attempts: AttemptOption[]): SetupStep {
  return setupReadiness(draft, attempts) || 'review';
}
export function setupWorkspaceDestination(value: string | null | undefined) {
  const next = sanitizeReturnPath(value, '/dashboard');
  const pathname = new URL(next, 'https://ca-progress-v2.invalid').pathname;
  if (/^\/(?:onboarding(?:-(?:offline-|layout-)?preview)?|login|account\/(?:setup|recover|reset)|auth|api)(?:\/|$)/.test(pathname)) return '/dashboard';
  return next;
}
