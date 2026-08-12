import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildEnvironmentReport } from '../../../scripts/environment-diagnostics.mjs';

const CACHE_TTL_MS = 30_000;

function unavailableReport(checkedAt, issue = '部署诊断服务暂不可用，请检查部署执行器状态。') {
  return {
    available: false,
    checkedAt: checkedAt.toISOString(),
    envUpdatedAt: null,
    source: 'unavailable',
    issue,
    summary: {
      state: 'unavailable', total: 0, healthy: 0, missing: 0, invalid: 0,
      inactive: 0, unused: 0, restartRequired: 0, verificationFailed: 0,
    },
    groups: [],
    variables: [],
  };
}

export function createEnvironmentDiagnostics({
  config,
  fetchImpl = fetch,
  now = () => new Date(),
  cacheTtlMs = CACHE_TTL_MS,
} = {}) {
  let cached = null;
  let expiresAt = 0;
  let inFlight = null;

  async function loadFromRunner() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImpl(new URL('environment', config.deployHookUrl), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.deployHookToken}`,
        },
      });
      const report = await response.json().catch(() => ({}));
      if (!response.ok || !report?.summary || !Array.isArray(report.variables)) {
        throw new Error('Invalid environment diagnostics response');
      }
      return { ...report, available: true, source: 'deployment-runner', issue: '' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadLocally() {
    const envPath = path.join(config.workspaceRoot, '.env');
    const [envSource, templateSource, composeSource, envStats] = await Promise.all([
      readFile(envPath, 'utf8'),
      readFile(path.join(config.workspaceRoot, '.env.example'), 'utf8'),
      readFile(path.join(config.workspaceRoot, 'infra', 'docker', 'compose.yml'), 'utf8'),
      stat(envPath),
    ]);
    return {
      ...buildEnvironmentReport({
        envSource,
        templateSource,
        composeSource,
        envUpdatedAt: envStats.mtime.toISOString(),
        checkedAt: now().toISOString(),
      }),
      available: true,
      source: 'local-workspace',
      issue: '',
    };
  }

  async function load() {
    try {
      const runnerConfigured = Boolean(config.deployHookUrl && config.deployHookToken);
      return runnerConfigured ? await loadFromRunner() : await loadLocally();
    } catch {
      return unavailableReport(now());
    }
  }

  async function getReport({ refresh = false } = {}) {
    const timestamp = now().getTime();
    if (!refresh && cached && timestamp < expiresAt) return structuredClone(cached);
    if (!refresh && inFlight) return structuredClone(await inFlight);
    inFlight = load();
    try {
      cached = await inFlight;
      expiresAt = timestamp + cacheTtlMs;
      return structuredClone(cached);
    } finally {
      inFlight = null;
    }
  }

  async function getSummary(options) {
    const report = await getReport(options);
    return {
      available: report.available,
      checkedAt: report.checkedAt,
      envUpdatedAt: report.envUpdatedAt,
      source: report.source,
      issue: report.issue,
      ...report.summary,
    };
  }

  return { getReport, getSummary };
}
