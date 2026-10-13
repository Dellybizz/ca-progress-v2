import {SetupScreens,type SetupScreenProps} from '../../../components/auth/onboarding/setup';
// Phase 6 connects these local screens to account/cached-catalog/draft handoff.
export function NativeAcademicSetup(props:Omit<SetupScreenProps,'assets'>){return <SetupScreens {...props} assets={{stationery:'assets/onboarding/stationery.svg',book:'assets/onboarding/book.svg'}}/>;}
