import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function serviceBlock(compose, serviceName) {
  const lines = String(compose || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${serviceName}:`);
  if (start < 0) return '';
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:$/.test(lines[index]) || /^(?:networks|volumes):$/.test(lines[index])) break;
    block.push(lines[index]);
  }
  return block.join('\n');
}

function normalizedAdminPath(value) {
  if (value === null) return null;
  const text = String(value || '');
  return text.endsWith('/') ? text : `${text}/`;
}

export function inspectTopology({
  topology,
  dockerRegistry,
  localRegistry,
  compose,
  debugCompose,
  additionalNginx,
  envExample,
  ciWorkflow,
  runtimeSources,
}) {
  const errors = [];
  if (topology.schemaVersion !== 1 || !Array.isArray(topology.services)) {
    return ['config/service-topology.json has an unsupported schema'];
  }
  for (const service of topology.services) {
    const docker = dockerRegistry.services.find((item) => item.id === service.registryId);
    const local = localRegistry.services.find((item) => item.id === service.registryId);
    if (!docker || !local) {
      errors.push(`${service.id}: missing service registry entry`);
      continue;
    }
    if (docker.baseUrl !== service.internalUrl) errors.push(`${service.id}: Docker registry URL drifted`);
    if (docker.healthPath !== service.healthPath) errors.push(`${service.id}: Docker health path drifted`);
    if (normalizedAdminPath(docker.adminUrl) !== service.managedAppPath) errors.push(`${service.id}: Docker admin path drifted`);
    const expectedPublicUrl = `${topology.publicOrigin}${service.publicApiPath}`;
    if (local.baseUrl !== expectedPublicUrl) errors.push(`${service.id}: canonical public URL drifted`);
    if (normalizedAdminPath(local.adminUrl) !== service.managedAppPath) errors.push(`${service.id}: canonical admin path drifted`);
    if (!compose.includes(`${service.targetEnv}: ${service.internalUrl}`)) {
      errors.push(`${service.id}: Compose does not inject ${service.targetEnv}`);
    }
    if (!compose.includes(`${service.legacyHostEnv}: \${${service.legacyHostEnv}`)) {
      errors.push(`${service.id}: Compose does not pass ${service.legacyHostEnv} to the gateway`);
    }
    const block = serviceBlock(compose, service.internalUrl.slice('http://'.length).split(':')[0]);
    if (service.hostPortForbidden && block.split('\n').some((line) => line.trim() === 'ports:')) {
      errors.push(`${service.id}: production Compose exposes a host port`);
    }
  }
  for (const name of ['CAMPUS_HOSTS', 'MQTT_HOSTS']) {
    if (!new RegExp(`^${name}=`, 'm').test(envExample)) errors.push(`.env.example is missing ${name}`);
  }
  if (!/campus-service:[\s\S]*?ports:/m.test(debugCompose) || !/iot-service:[\s\S]*?ports:/m.test(debugCompose)) {
    errors.push('debug Compose must retain loopback-only Campus and IoT ports');
  }
  if (/proxy_pass\s+http:\/\/127\.0\.0\.1:(?:22101|22102)/.test(additionalNginx)) {
    errors.push('independent domains bypass the platform gateway');
  }
  if (!ciWorkflow.includes('http://127.0.0.1:22100/api/iot/api/ready')) {
    errors.push('CI IoT readiness smoke bypasses the platform gateway');
  }
  if (/http:\/\/127\.0\.0\.1:22102\//.test(ciWorkflow)) {
    errors.push('CI depends on the production-forbidden IoT host port');
  }
  const forbiddenRuntimeDomain = /https:\/\/(?:xcx|haxx|hgu|mqttapi|tongzhiapi)\.pxyb\.cn/i;
  for (const [file, source] of Object.entries(runtimeSources)) {
    if (forbiddenRuntimeDomain.test(source)) errors.push(`${file}: runtime code depends on a legacy public domain`);
  }
  return errors;
}

export function loadWorkspaceInputs(workspaceRoot = root) {
  const read = (relativePath) => fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
  return {
    topology: JSON.parse(read('config/service-topology.json')),
    dockerRegistry: JSON.parse(read('config/platform.services.docker.json')),
    localRegistry: JSON.parse(read('config/platform.services.local.json')),
    compose: read('infra/docker/compose.yml'),
    debugCompose: read('infra/docker/compose.debug.yml'),
    additionalNginx: read('infra/nginx/additional-domains.conf.example.disabled'),
    envExample: read('.env.example'),
    ciWorkflow: read('.github/workflows/ci.yml'),
    runtimeSources: Object.fromEntries([
      'services/core-api/routes/iot.js',
      'services/core-api/services/dueReminder.js',
      'services/core-api/services/settingsService.js',
      'services/core-api/services/todoReminder.js',
    ].map((relativePath) => [relativePath, read(relativePath)])),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = inspectTopology(loadWorkspaceInputs());
  if (errors.length > 0) {
    console.error(`Service topology validation failed:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Service topology matches the canonical gateway and internal network contract.');
}
