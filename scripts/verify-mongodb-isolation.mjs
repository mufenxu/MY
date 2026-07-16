import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envFile = process.argv[2] || '.env';
const composeArgs = ['compose', '--env-file', envFile, '-f', 'infra/docker/compose.yml'];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function runMongo({ username, password, authenticationDatabase, script, label }) {
  const result = spawnSync('docker', [
    ...composeArgs,
    'exec', '-T', 'mongodb',
    'mongosh', '--quiet', '--host', '127.0.0.1', '--port', '27017',
    '--username', username,
    '--password', password,
    '--authenticationDatabase', authenticationDatabase,
    '--eval', script,
  ], { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
}

const definitions = [
  ['platform_app', required('MONGO_PLATFORM_USERNAME'), required('MONGO_PLATFORM_PASSWORD')],
  ['core_app', required('MONGO_CORE_USERNAME'), required('MONGO_CORE_PASSWORD')],
  ['exam_app', required('MONGO_EXAM_USERNAME'), required('MONGO_EXAM_PASSWORD')],
  ['campus_app', required('MONGO_CAMPUS_USERNAME'), required('MONGO_CAMPUS_PASSWORD')],
  ['iot_app', required('MONGO_IOT_USERNAME'), required('MONGO_IOT_PASSWORD')],
];

runMongo({
  username: required('MONGO_ROOT_USERNAME'),
  password: required('MONGO_ROOT_PASSWORD'),
  authenticationDatabase: 'admin',
  label: 'replica-set and managed-user verification',
  script: `
    if (rs.status().myState !== 1) throw new Error('MongoDB is not PRIMARY');
    const managed = db.getSiblingDB('admin').my_platform_managed_users;
    const expected = ${JSON.stringify(definitions.map(([databaseName, username]) => ({ databaseName, username })))};
    for (const item of expected) {
      const user = db.getSiblingDB(item.databaseName).getUser(item.username);
      if (!user || user.roles.length !== 1 || user.roles[0].role !== 'readWrite' || user.roles[0].db !== item.databaseName) {
        throw new Error('Unexpected roles for ' + item.databaseName);
      }
      const record = managed.findOne({ _id: item.databaseName });
      if (!record || record.username !== item.username) throw new Error('Managed user registry mismatch');
    }
  `,
});

for (let index = 0; index < definitions.length; index += 1) {
  const [databaseName, username, password] = definitions[index];
  const otherDatabase = definitions[(index + 1) % definitions.length][0];
  runMongo({
    username,
    password,
    authenticationDatabase: databaseName,
    label: `${databaseName} least-privilege verification`,
    script: `
      const own = db.getSiblingDB(${JSON.stringify(databaseName)});
      const marker = 'verify-' + Date.now();
      own.permission_verification.updateOne({ _id: marker }, { $set: { ok: true } }, { upsert: true });
      if (!own.permission_verification.findOne({ _id: marker })?.ok) throw new Error('Own database write failed');
      own.permission_verification.deleteOne({ _id: marker });
      let denied = false;
      try {
        db.getSiblingDB(${JSON.stringify(otherDatabase)}).permission_verification.findOne({});
      } catch (error) {
        denied = error.code === 13 || error.codeName === 'Unauthorized';
      }
      if (!denied) throw new Error('Cross-database read was not denied');
    `,
  });
}

console.log('MongoDB replica set and five least-privilege application accounts verified.');
