import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const db=new DatabaseSync(':memory:');
try{
 db.exec('CREATE VIRTUAL TABLE searchable USING fts5(title,body,owner UNINDEXED)');const insert=db.prepare('INSERT INTO searchable(title,body,owner)VALUES(?,?,?)');
 for(let i=0;i<10001;i++)insert.run('Note '+i,i===10000?'Sentinel accounting revision':'Study text '.repeat(60),i===10000?'alice':'bob');
 const start=performance.now();const owned=db.prepare('SELECT title,snippet(searchable,1,\'<mark>\',\'</mark>\',\'…\',16) excerpt FROM searchable WHERE searchable MATCH ? AND owner=?').all('Sentinel','alice');const ms=performance.now()-start;
 assert.equal(owned.length,1);assert.equal(owned[0].title,'Note 10000');assert.equal(db.prepare('SELECT count(*) n FROM searchable WHERE searchable MATCH ? AND owner=?').get('Sentinel','bob').n,0);
 console.log(JSON.stringify({prototype:'SQLite FTS5; production D1 rollout requires its own gate',records:10001,owner_safe:true,query_ms:Math.round(ms*100)/100}));
}finally{db.close();}
