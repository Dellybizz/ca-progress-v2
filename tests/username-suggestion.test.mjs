import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';

const bundle = await build({entryPoints:['lib/auth/username-suggestion.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {usernameFromName, availableUsernameSuggestionSql} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('username suggestions use the account name and satisfy username rules', () => {
  assert.equal(usernameFromName('Zaid Asif'), 'zaid.asif');
  assert.equal(usernameFromName('  José O’Neil  '), 'jose.oneil');
  for (const name of ['A', 'Li', '', null, '123 Zaid', '名', 'A'.repeat(100)]) {
    assert.match(usernameFromName(name), /^[a-z][a-z0-9._]{2,29}$/);
  }
});

test('name suggestion adds a short suffix for taken names without changing existing accounts', () => {
  const script = `import json,sqlite3,sys
x=json.load(sys.stdin);d=sqlite3.connect(':memory:')
d.execute('CREATE TABLE account_usernames(user_id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE)')
d.executemany('INSERT INTO account_usernames VALUES(?,?)',[('a','ZAID.ASIF'),('b','zaid.asif1'),('self','student_longassignedname')])
before=d.execute('SELECT * FROM account_usernames ORDER BY user_id').fetchall()
assert d.execute(x['sql'],('zaid.asif','self')).fetchone()[0]=='zaid.asif2'
assert d.execute(x['sql'],('zaid.asif','a')).fetchone()[0]=='zaid.asif'
assert d.execute(x['sql'],('sara.khan','self')).fetchone()[0]=='sara.khan'
assert d.execute('SELECT * FROM account_usernames ORDER BY user_id').fetchall()==before
`;
  const result = spawnSync('python3', ['-c', script], {input:JSON.stringify({sql:availableUsernameSuggestionSql}),encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
