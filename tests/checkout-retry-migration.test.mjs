import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('every retained migration is included in the already-applied ledger lookup',()=>{
 const source=readFileSync('scripts/apply-retained-d1-migrations.mjs','utf8');
 const registered=[...source.matchAll(/\["(\d{4})", "d1\/migrations\//g)].map(m=>m[1]);
 const lookups=[...source.matchAll(/query\("SELECT version FROM _ca_schema_migrations ([^"\n]+)"\)/g)].map(m=>m[1]).join(' ');
 const range=/BETWEEN '(\d{4})' AND '(\d{4})'/.exec(lookups);
 for(const version of registered)assert.ok((range&&version>=range[1]&&version<=range[2])||lookups.includes(`'${version}'`),`Migration ${version} would be replayed on the second deployment stage`);
});
