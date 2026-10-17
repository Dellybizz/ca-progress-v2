import { query, transaction } from "./database";
import { notifyLocalAccountChanged } from "./repository";

export type LocalConflict={id:string;entityType:string;localId:string;localValue:string;serverValue:string;createdAt:string};
const conflictTables:Record<string,string>={progress:"progress_records",planner_task:"planner_items",planner_goal:"planner_items",revision_settings:"application_config",note:"notes",focus_session:"study_sessions",session_review:"study_sessions"};

export async function readOpenConflicts(accountId:string):Promise<LocalConflict[]>{
  const rows=await query<{conflict_id:string;entity_type:string;entity_local_id:string;local_json:string;server_json:string;created_at:string}>("SELECT conflict_id,entity_type,entity_local_id,local_json,server_json,created_at FROM conflicts WHERE account_id=? AND resolved_at IS NULL ORDER BY created_at DESC",[accountId]);
  return rows.map(row=>({id:row.conflict_id,entityType:row.entity_type,localId:row.entity_local_id,localValue:row.local_json,serverValue:row.server_json,createdAt:row.created_at}));
}

// Only an explicit choice can discard a queued edit. The next bootstrap reads
// the server state; newly-created local rows have no server record to restore.
export async function acceptServerConflict(accountId:string,conflictId:string):Promise<void>{
  const rows=await query<{entity_type:string;entity_local_id:string}>("SELECT entity_type,entity_local_id FROM conflicts WHERE account_id=? AND conflict_id=? AND resolved_at IS NULL LIMIT 1",[accountId,conflictId]);
  const row=rows[0];if(!row)throw new Error("This conflict is no longer open.");
  const table=conflictTables[row.entity_type];if(!table)throw new Error("This change needs manual review.");
  const at=new Date().toISOString();
  await transaction([
    {sql:`UPDATE ${table} SET local_state='synced',deleted_at=CASE WHEN server_id IS NULL THEN ? ELSE deleted_at END,updated_at=? WHERE account_id=? AND local_id=?`,args:[at,at,accountId,row.entity_local_id]},
    {sql:"DELETE FROM mutation_outbox WHERE account_id=? AND entity_local_id=?",args:[accountId,row.entity_local_id]},
    {sql:"UPDATE conflicts SET resolved_at=? WHERE account_id=? AND entity_local_id=? AND resolved_at IS NULL",args:[at,accountId,row.entity_local_id]},
  ]);
  notifyLocalAccountChanged(accountId);
}
