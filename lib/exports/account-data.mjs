import {FULL_BACKUP_DATASETS,iterateOwnedBackupDatasetPages} from './backup-data.mjs';
// Plan-independent export of owned structured records. Existing paid archive tools
// continue to include their richer formatting and bundled private file bytes.
export async function* ownedAccountDataChunks(db,userId) {
  if(typeof userId!=='string'||!userId.trim())throw new Error('Authenticated account is required.');
  const encode=value=>new TextEncoder().encode(JSON.stringify(value)+'\n');
  yield encode({schema:'ca-progress-account-data-v1',generatedAt:new Date().toISOString(),files:'Download original files from their existing owner-only links.'});
  for(const dataset of FULL_BACKUP_DATASETS){
    for await(const rows of iterateOwnedBackupDatasetPages(db,userId,dataset,{batchSize:100})){
      if(rows.length)yield encode({dataset:dataset.key,rows});
    }
  }
  yield encode({complete:true});
}
export function ownedAccountDataStream(db,userId){
  const iterator=ownedAccountDataChunks(db,userId);
  return new ReadableStream({
    async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);}catch(error){controller.error(error);await iterator.return();}},
    async cancel(){await iterator.return();}
  });
}
