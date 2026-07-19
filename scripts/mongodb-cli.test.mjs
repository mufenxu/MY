import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMongoshArguments } from './mongodb-cli.mjs';

test('mongosh option values stay attached when credentials begin with a dash', () => {
  const args = buildMongoshArguments({
    username: '-application-user',
    password: '-random-password',
    authenticationDatabase: '-application-database',
    script: 'db.runCommand({ ping: 1 })',
  });

  assert.deepEqual(args, [
    'mongosh',
    '--quiet',
    '--host=127.0.0.1',
    '--port=27017',
    '--username=-application-user',
    '--password=-random-password',
    '--authenticationDatabase=-application-database',
    '--eval',
    'db.runCommand({ ping: 1 })',
  ]);
});

test('container MongoDB checks attach environment-backed credentials to their options', async () => {
  const [initScript, compose] = await Promise.all([
    readFile(new URL('../infra/docker/mongo-init.sh', import.meta.url), 'utf8'),
    readFile(new URL('../infra/docker/compose.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(initScript, /--username="\$MONGO_INITDB_ROOT_USERNAME"/);
  assert.match(initScript, /--password="\$MONGO_INITDB_ROOT_PASSWORD"/);
  assert.match(compose, /--username="\$\$MONGO_INITDB_ROOT_USERNAME"/);
  assert.match(compose, /--password="\$\$MONGO_INITDB_ROOT_PASSWORD"/);
});
