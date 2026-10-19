import {sanitizeReturnPath} from './navigation';
/** Account setup precedes academic setup without nesting either route into itself. */
export function accountEntryDestination(next:string,setupEligible:boolean,onboardingComplete:boolean){
 const safeNext=sanitizeReturnPath(next),pathname=new URL(safeNext,'https://ca-progress-v2.invalid').pathname;
 if(setupEligible&&pathname==='/account/setup')return safeNext;
 const afterSetup=onboardingComplete||pathname==='/onboarding'?safeNext:`/onboarding?next=${encodeURIComponent(pathname==='/account/setup'?'/planner/today':safeNext)}`;
 return setupEligible?`/account/setup?next=${encodeURIComponent(afterSetup)}`:afterSetup;
}
