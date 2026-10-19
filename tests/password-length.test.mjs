import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('password creation accepts eight characters and retains the 128 character maximum', async () => {
  const result = await build({
    entryPoints: ['lib/auth/password.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{name: 'unused-server-dependencies', setup(builder) {
      builder.onResolve({filter: /^(server-only|@opennextjs\/cloudflare|\.\/cloudflare)$/}, args => ({path: args.path, namespace: 'stub'}));
      builder.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export function getCloudflareContext(){throw Error("No database in this test")} export function issueSession(){throw Error("No sessions in this test")}'}));
    }}],
  });
  const {createPasswordHash, verifyPassword} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const length of [7, 129]) await assert.rejects(createPasswordHash('a'.repeat(length)), /8–128/);
  for (const length of [8, 128]) {
    const password = 'a'.repeat(length);
    const credential = await createPasswordHash(password);
    assert.equal(await verifyPassword(password, {...credential, password_hash: credential.hash}), true);
    assert.equal(await verifyPassword(password.toUpperCase(), {...credential, password_hash: credential.hash}), false);
  }
});
