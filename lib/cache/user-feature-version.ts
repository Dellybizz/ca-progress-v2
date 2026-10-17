import 'server-only';
import {cache} from 'react';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
// Request memoization only; every request reads the durable revision before cache reuse.
export const readUserFeatureRevision=cache(async(userId:string)=>{
 const row=await getD1RuntimeDatabase().prepare(`SELECT COALESCE((SELECT revision FROM user_feature_revisions WHERE user_id=?1),0) revision, (SELECT MIN(ends_at) FROM user_subscriptions WHERE user_id=?1 AND status IN ('active','paused','cancelled') AND ends_at IS NOT NULL AND julianday(ends_at)>julianday('now')) next_boundary`).bind(userId).first<{revision:number;next_boundary:string|null}>();
 return `${row?.revision??0}:${row?.next_boundary??'none'}`;
});
