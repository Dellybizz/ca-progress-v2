import type {SetupState} from './setup-contract';
import type {AttemptOption} from './validation';
export type SetupBootstrap = {ownerId:string;completed:boolean;state:SetupState|null;attempts:AttemptOption[];existingGoal:number|null};
