import 'server-only';
import {cache} from 'react';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
// Request memoization only; every request reads the durable revision before cache reuse.
export const readUserFeatureRevision=cache(async(userId:string)=>{
 const row=await getD1RuntimeDatabase().prepare('SELECT revision FROM user_feature_revisions WHERE user_id=?1').bind(userId).first<{revision:number}>();
 return String(row?.revision??0);
});
