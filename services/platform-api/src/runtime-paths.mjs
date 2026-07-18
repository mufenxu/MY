import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeFiles = {
  coreServer: ['CORE_SERVER_PATH', 'services/core-api/server.js'],
  coreStatic: ['CORE_STATIC_PATH', 'apps/core-admin/dist'],
  examServer: ['EXAM_SERVER_PATH', 'services/exam-api/src/server.js'],
  notifyApp: ['NOTIFY_APP_PATH', 'services/notification-service/src/app.js'],
  portalApp: ['PORTAL_APP_PATH', 'apps/admin-console/src/app.js'],
  portalConfig: ['PORTAL_CONFIG_PATH', 'apps/admin-console/src/config.js'],
  portalMongoSessionRegistry: ['PORTAL_MONGO_SESSION_REGISTRY_PATH', 'apps/admin-console/src/mongo-session-registry.js'],
  portalOperationsStore: ['PORTAL_OPERATIONS_STORE_PATH', 'apps/admin-console/src/operations-store.js'],
};
const localServiceRuntimeNames = new Set(['coreServer', 'coreStatic', 'examServer', 'notifyApp']);

export function resolveWorkspaceRoot(moduleUrl = import.meta.url) {
  const moduleDirectory = path.dirname(fileURLToPath(moduleUrl));
  return path.resolve(moduleDirectory, '..', '..', '..');
}

export function resolveRuntimePaths({
  env = process.env,
  includeLocalServices = true,
  moduleUrl = import.meta.url,
} = {}) {
  const workspaceRoot = resolveWorkspaceRoot(moduleUrl);
  const paths = {};

  for (const [name, [envName, fallback]] of Object.entries(runtimeFiles)) {
    if (!includeLocalServices && localServiceRuntimeNames.has(name)) continue;
    paths[name] = env[envName]
      ? path.resolve(env[envName])
      : path.join(workspaceRoot, fallback);
  }

  return { workspaceRoot, paths };
}
