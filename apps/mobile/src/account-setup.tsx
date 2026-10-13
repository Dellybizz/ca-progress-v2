import {AccountCredentials} from '../../../components/auth/onboarding/accounts';
import {useOnline} from '../../../components/auth/onboarding/use-online';
import {nativeApiRequest} from './native-auth';
export type AccountSetupState={eligible:boolean;username:string|null;isTemporary:boolean;hasPassword:boolean};
export function NativeAccountSetup({assignedUsername,onLater,onCompleted,onProfile}:{assignedUsername:string;onLater:()=>void;onCompleted:()=>void;onProfile:()=>void}){return <div className="ca-native-account-setup"><AccountCredentials online={useOnline()} assets={{stationery:'assets/onboarding/stationery.svg',book:'assets/onboarding/book.svg'}} assignedUsername={assignedUsername} onBack={onLater} onLater={onLater} onProfile={onProfile} onSave={async(username,password)=>{await nativeApiRequest('/api/v1/account-setup',{method:'POST',body:JSON.stringify({username,password})});onCompleted();}}/></div>;}
