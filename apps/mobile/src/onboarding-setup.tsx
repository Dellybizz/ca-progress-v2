import {SetupScreens,type SetupScreenProps} from '../../../components/auth/onboarding/setup';
// Portable screen adapter; onboarding-entry connects persistence and account handoff.
export function NativeAcademicSetup(props:Omit<SetupScreenProps,'assets'>){return <SetupScreens {...props} assets={{stationery:'assets/onboarding/stationery.svg',book:'assets/onboarding/book.svg'}}/>;}
