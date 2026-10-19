import {optionalUser} from '@/lib/auth/server';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
import {cleanupStatus} from '@/lib/billing/storage-cleanup.mjs';
import {StorageCleanupNotice} from './storage-cleanup-notice';
export async function StorageCleanupWarning(){
 const user=await optionalUser();if(!user)return null;
 const status=await cleanupStatus(getD1RuntimeDatabase(),user.id);
 return <StorageCleanupNotice key={status?`${status.id}:${status.state}:${status.usedBytes}:${status.filesToDelete}`:'none'} initialStatus={status}/>;
}
