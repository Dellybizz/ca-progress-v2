import {configuredStorageBytes,tierRank} from './plan-policy.mjs';
export async function storageAllowance(db,user,entitlement,time=new Date().toISOString()){
 if(!entitlement?.planId)throw new Error('storage_entitlement_unavailable');
 const reward=await db.prepare(`SELECT p.id plan_id,p.tier_key,p.name,e.enabled,e.limit_value,e.limit_unit FROM leaderboard_reward_grants g JOIN subscription_plans p ON p.id=g.plan_id AND p.active=1 JOIN plan_entitlements e ON e.plan_id=p.id AND e.feature_key='resources.storage'
 WHERE g.user_id=?1 AND g.status IN ('scheduled','active','withheld') AND g.starts_at<=?2 AND g.ends_at>?2 AND NOT EXISTS(SELECT 1 FROM anti_cheat_flags a WHERE a.user_id=g.user_id AND a.status IN ('pending','upheld')) ORDER BY p.rank DESC,g.rank ASC LIMIT 1`).bind(user,time).first();
 if(reward&&tierRank(reward.tier_key)>tierRank(entitlement.tier))entitlement={...entitlement,planId:reward.plan_id,tier:reward.tier_key,planName:reward.name,allowed:Number(reward.enabled)===1,storageLimitBytes:null,limitValue:reward.limit_value,limitUnit:reward.limit_unit};
 const base=entitlement.allowed?configuredStorageBytes(entitlement):0;
 const override=await db.prepare("SELECT 1 FROM entitlement_overrides WHERE user_id=?1 AND feature_key='resources.storage' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?2) LIMIT 1").bind(user,time).first();
 if(override)return {...entitlement,limitBytes:base};
 const latest=await db.prepare(`SELECT f.storage_limit_bytes,f.enabled,p.enabled page_enabled,v.published_at,v.effective_at,v.id policy_id FROM plan_policy_versions v JOIN plan_policy_features f ON f.policy_version_id=v.id AND f.feature_key='resources.storage' JOIN plan_policy_pages p ON p.policy_version_id=v.id AND p.page_key=f.page_key
 WHERE v.plan_id=?1 AND v.state='published' AND (v.effective_at IS NULL OR v.effective_at<=?2) ORDER BY COALESCE(v.effective_at,v.published_at,v.created_at) DESC,v.version DESC LIMIT 1`).bind(entitlement.planId,time).first();
 if(!latest)return {...entitlement,limitBytes:base};
 const candidate=Number(latest.enabled)===1&&Number(latest.page_enabled)===1?latest.storage_limit_bytes:0;
 if(candidate==null)return {...entitlement,limitBytes:base};
 const limit=Number(candidate);if(!Number.isSafeInteger(limit)||limit<0)throw new Error('storage_policy_invalid');
 if(limit>=base)return {...entitlement,allowed:limit>0,limitBytes:limit};
 const paid=await db.prepare("SELECT starts_at FROM user_subscriptions WHERE user_id=?1 AND plan_id=?2 AND starts_at<=?3 AND ends_at>?3 AND status IN ('active','paused','cancelled') ORDER BY starts_at DESC LIMIT 1").bind(user,entitlement.planId,time).first();
 const published=Date.parse(latest.effective_at??latest.published_at);
 return {...entitlement,allowed:(paid&&Date.parse(paid.starts_at)<published?base:limit)>0,limitBytes:paid&&Date.parse(paid.starts_at)<published?base:limit};
}
