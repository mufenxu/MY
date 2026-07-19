import crypto from 'node:crypto';
import { chmod, chown, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const placeholderPattern = /(?:replace|change)_with_|example\.com|x{6,}/i;

export function parseEnv(source) {
  const values = new Map();
  for (const line of String(source || '').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    if (values.has(match[1])) throw new Error(`Duplicate environment key: ${match[1]}`);
    values.set(match[1], match[2]);
  }
  return values;
}

export function updateEnv(source, updates) {
  const pending = new Map(Object.entries(updates));
  const newline = String(source).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(source).split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  for (const [key, value] of pending) {
    if (lines.at(-1) !== '') lines.push('');
    lines.push(`${key}=${value}`);
  }
  return lines.join(newline);
}

function strong(value, minimum = 32) {
  return String(value || '').length >= minimum && !placeholderPattern.test(value);
}

function updateProfiles(value, enabled) {
  const selected = new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
  if (enabled) selected.add('release');
  else selected.delete('release');
  return [...selected].join(',');
}

function defaultWorkspaceRoot() {
  return process.platform === 'win32' ? '/opt/my-platform' : process.cwd();
}

export function configureSidecar(
  source,
  command,
  tokenFactory = () => crypto.randomBytes(32).toString('base64url'),
  workspaceRoot = defaultWorkspaceRoot(),
  dockerGid = '0',
) {
  const values = parseEnv(source);
  if (!['configure', 'enable-actions', 'disable'].includes(command)) {
    throw new Error('Command must be configure, enable-actions or disable.');
  }

  if (command === 'disable') {
    return updateEnv(source, {
      COMPOSE_PROFILES: updateProfiles(values.get('COMPOSE_PROFILES'), false),
      PLATFORM_RELEASE_ACTIONS_ENABLED: 'false',
      PLATFORM_DEPLOY_HOOK_URL: '',
    });
  }

  const callbackToken = values.get('PLATFORM_RELEASE_CALLBACK_TOKEN') || '';
  const repository = String(values.get('PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY') || '').replace(/[:/@]+$/, '');
  if (!strong(callbackToken)) throw new Error('PLATFORM_RELEASE_CALLBACK_TOKEN must be configured first.');
  if (!/^[a-z0-9][a-z0-9._/-]+$/i.test(repository)) {
    throw new Error('PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY must be configured first.');
  }

  let deployToken = values.get('PLATFORM_DEPLOY_HOOK_TOKEN') || '';
  if (!strong(deployToken)) deployToken = tokenFactory();
  if (!strong(deployToken) || deployToken === callbackToken) {
    throw new Error('The deployment token must be strong and different from the callback token.');
  }

  if (command === 'enable-actions' && !strong(values.get('PLATFORM_GITHUB_TOKEN'), 20)) {
    throw new Error('PLATFORM_GITHUB_TOKEN must be configured before release actions are enabled.');
  }

  const deploymentWorkspaceRoot = values.get('DEPLOY_RUNNER_WORKSPACE_ROOT') || workspaceRoot;
  if (!path.posix.isAbsolute(deploymentWorkspaceRoot) || deploymentWorkspaceRoot.includes('..')) {
    throw new Error('DEPLOY_RUNNER_WORKSPACE_ROOT must be an absolute Linux host path.');
  }
  if (!/^\d+$/.test(String(dockerGid))) {
    throw new Error('DEPLOY_RUNNER_DOCKER_GID must be a numeric group ID.');
  }

  return updateEnv(source, {
    COMPOSE_PROFILES: updateProfiles(values.get('COMPOSE_PROFILES'), true),
    DEPLOYMENT_RUNNER_IMAGE: values.get('DEPLOYMENT_RUNNER_IMAGE') || `${repository}:deployment-runner-latest`,
    DEPLOY_RUNNER_DOCKER_GID: String(dockerGid),
    DEPLOY_RUNNER_WORKSPACE_ROOT: path.posix.normalize(deploymentWorkspaceRoot),
    PLATFORM_DEPLOY_HOOK_URL: 'http://deployment-runner:22104',
    PLATFORM_DEPLOY_HOOK_TOKEN: deployToken,
    DEPLOY_RUNNER_ENV_FILE: path.basename(values.get('DEPLOY_RUNNER_ENV_FILE') || '.env'),
    DEPLOY_RUNNER_ALLOW_MONGODB: values.get('DEPLOY_RUNNER_ALLOW_MONGODB') || 'false',
    PLATFORM_RELEASE_ACTIONS_ENABLED: command === 'enable-actions' ? 'true' : 'false',
  });
}

async function main() {
  const command = process.argv[2] || 'configure';
  const filename = path.resolve(process.argv[3] || '.env');
  const source = await readFile(filename, 'utf8');
  const dockerGid = command === 'disable' || process.platform === 'win32'
    ? '0'
    : String((await stat('/var/run/docker.sock')).gid);
  const updated = configureSidecar(source, command, undefined, undefined, dockerGid);
  const fileStat = await stat(filename);
  const temporary = `${filename}.${process.pid}.tmp`;
  if (command !== 'disable' && process.platform !== 'win32') {
    const directory = path.dirname(filename);
    const directoryStat = await stat(directory);
    await chown(directory, directoryStat.uid, Number(dockerGid));
    await chmod(directory, (directoryStat.mode & 0o777) | 0o2070);
  }
  await writeFile(temporary, updated, { encoding: 'utf8', mode: 0o600 });
  if (command !== 'disable' && process.platform !== 'win32') {
    await chown(temporary, fileStat.uid, Number(dockerGid));
    await chmod(temporary, (fileStat.mode & 0o777) | 0o060);
  } else {
    await chmod(temporary, fileStat.mode & 0o777);
  }
  await rename(temporary, filename);
  console.log(`Deployment Sidecar ${command} configuration applied to ${path.basename(filename)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
