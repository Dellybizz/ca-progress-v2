import 'server-only';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
import type {SetupDraft,SetupState} from './setup-contract';
export async function getSetupState(userId:string):Promise<(SetupState&{completed:boolean})|null>{const row=await getD1RuntimeDatabase().prepare('SELECT draft_json,revision,completed_at FROM onboarding_setup WHERE user_id=?1 AND schema_version=2').bind(userId).first<{draft_json:string;revision:number;completed_at:string|null}>();if(!row)return null;return {draft:JSON.parse(row.draft_json) as SetupDraft,revision:row.revision,completed:Boolean(row.completed_at)};}
export async function hasTentativeSetup(userId:string){const row=await getD1RuntimeDatabase().prepare(`SELECT user_id FROM onboarding_setup WHERE user_id=?1 AND completed_at IS NOT NULL AND json_extract(draft_json,'$.attemptDecision')='undecided'`).bind(userId).first();return Boolean(row);}
