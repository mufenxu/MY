import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const host = process.env.MONGODB_MIGRATION_HOST || '127.0.0.1';
const port = process.env.MONGODB_PORT || '27017';

function uri(database, username, password) {
  return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=${database}&directConnection=true`;
}

const tasks = [];
if (process.env.LEGACY_CAMPUS_DB) {
  tasks.push({
    project: 'services/campus-service',
    script: 'migrate:sqlite',
    argument: path.resolve(process.env.LEGACY_CAMPUS_DB),
    env: {
      CAMPUS_MONGODB_URI: uri('campus_app', process.env.MONGO_CAMPUS_USERNAME, process.env.MONGO_CAMPUS_PASSWORD),
    },
  });
}
if (process.env.LEGACY_IOT_DATA_DIR) {
  tasks.push({
    project: 'services/iot-service',
    script: 'migrate:sqlite',
    argument: path.resolve(process.env.LEGACY_IOT_DATA_DIR),
    env: {
      IOT_MONGODB_URI: uri('iot_app', process.env.MONGO_IOT_USERNAME, process.env.MONGO_IOT_PASSWORD),
    },
  });
}
if (tasks.length === 0) throw new Error('Set LEGACY_CAMPUS_DB and/or LEGACY_IOT_DATA_DIR.');

for (const task of tasks) {
  const result = spawnSync(
    npm,
    ['--prefix', task.project, 'run', task.script, '--', task.argument],
    { cwd: root, env: { ...process.env, ...task.env }, stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
