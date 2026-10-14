import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const exportPath=process.argv[2];if(!exportPath)throw Error('A private D1 export is required.');
const db=new DatabaseSync(':memory:');
try{
 // D1 exports may insert children before their referenced tables exist.
 // Validate all relationships after the complete export has been restored.
 db.exec('PRAGMA foreign_keys=OFF;');
 // SQLite's statement parser handles quoted semicolons and compound triggers.
 // Install exported triggers only after all tables and data exist, so restore
 // does not replay application side effects against partially restored tables.
 const restoreSql=execFileSync('python3',['-c',`import sys,sqlite3,re
sql=sys.stdin.read(); statements=[]; pending=''
for char in sql:
 pending+=char
 if char==';' and sqlite3.complete_statement(pending):
  statements.append(pending); pending=''
if pending.strip(): statements.append(pending)
def trigger(statement):
 clean=re.sub(r'/\\*.*?\\*/|--[^\\n]*','',statement,flags=re.S).lstrip()
 return re.match(r'CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?TRIGGER\\b',clean,re.I) is not None
sys.stdout.write('\\n'.join([s for s in statements if not trigger(s)]+[s for s in statements if trigger(s)]))
`],{input:readFileSync(exportPath,'utf8'),encoding:'utf8',maxBuffer:256*1024*1024});
 db.exec(restoreSql);
 db.exec('PRAGMA foreign_keys=ON;');
 function fingerprint(){const hash=createHash('sha256');for(const table of ['notes','uploaded_resources']){hash.update(table);for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY id`).iterate())hash.update(JSON.stringify(row));}return hash.digest('hex');}
 const before=fingerprint();
 for(const version of ['0095','0096'])if(!db.prepare('SELECT version FROM _ca_schema_migrations WHERE version=?').get(version))db.exec(readFileSync(`d1/migrations/${version==='0095'?'0095_resource_workspace':'0096_resource_workspace_lifecycle'}.sql`,'utf8'));
 if(fingerprint()!==before)throw Error('Migration changed existing note/upload records.');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Restore drill found foreign-key violations.');
 console.log(JSON.stringify({restore_drill:'passed',existing_notes_and_uploads_unchanged:true,foreign_key_violations:0}));
}finally{db.close();}
