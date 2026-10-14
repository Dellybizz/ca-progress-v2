import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const exportPath=process.argv[2];if(!exportPath)throw Error('A private D1 export is required.');
const db=new DatabaseSync(':memory:');
try{
 db.exec(readFileSync(exportPath,'utf8'));
 function fingerprint(){const hash=createHash('sha256');for(const table of ['notes','uploaded_resources']){hash.update(table);for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY id`).iterate())hash.update(JSON.stringify(row));}return hash.digest('hex');}
 const before=fingerprint();
 for(const version of ['0095','0096'])if(!db.prepare('SELECT version FROM _ca_schema_migrations WHERE version=?').get(version))db.exec(readFileSync(`d1/migrations/${version==='0095'?'0095_resource_workspace':'0096_resource_workspace_lifecycle'}.sql`,'utf8'));
 if(fingerprint()!==before)throw Error('Migration changed existing note/upload records.');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Restore drill found foreign-key violations.');
 console.log(JSON.stringify({restore_drill:'passed',existing_notes_and_uploads_unchanged:true,foreign_key_violations:0}));
}finally{db.close();}
