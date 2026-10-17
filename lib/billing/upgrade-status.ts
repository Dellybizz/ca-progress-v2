import 'server-only';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
export async function getUpgradeStatus(userId:string|undefined){
 if(!userId)return null;
 const row=await getD1RuntimeDatabase().prepare(`SELECT u.state,u.activated_at,u.access_ends_at,g.policy_snapshot_json FROM subscription_upgrades u JOIN subscription_purchase_groups g ON g.id=u.purchase_group_id WHERE u.user_id=?1 AND u.state NOT IN ('completed','failed') ORDER BY u.updated_at DESC LIMIT 1`).bind(userId).first<{state:string;activated_at:string|null;access_ends_at:string|null;policy_snapshot_json:string}>();
 if(!row)return null;
 const saved=JSON.parse(row.policy_snapshot_json) as {targetTier?:string;kind?:string;quote:{nextRenewalAt:string}};
 return {kind:saved.kind,planLabel:saved.targetTier==='basic'?'Striver':'Ranker',state:row.state,paid:row.activated_at!==null,endsAt:row.access_ends_at??saved.quote.nextRenewalAt};
}
