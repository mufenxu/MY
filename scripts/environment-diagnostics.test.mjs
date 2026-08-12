import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnvironmentReport } from './environment-diagnostics.mjs';

const templateSource = `# 平台公开地址。
PLATFORM_PUBLIC_ORIGIN=https://admin.example.com
# 平台会话签名密钥。
PLATFORM_SESSION_SECRET=replace_with_at_least_32_random_characters
# 发布中心开关。
PLATFORM_RELEASE_ACTIONS_ENABLED=false
# GitHub 访问令牌。
PLATFORM_GITHUB_TOKEN=
# IoT 数据保留天数。
DATA_RETENTION_DAYS=30
`;

const composeSource = `services:
  platform-api:
    environment:
      PLATFORM_PUBLIC_ORIGIN: \${PLATFORM_PUBLIC_ORIGIN:?Set PLATFORM_PUBLIC_ORIGIN}
      PLATFORM_SESSION_SECRET: \${PLATFORM_SESSION_SECRET:?Set PLATFORM_SESSION_SECRET}
      PLATFORM_RELEASE_ACTIONS_ENABLED: \${PLATFORM_RELEASE_ACTIONS_ENABLED:-false}
      PLATFORM_GITHUB_TOKEN: \${PLATFORM_GITHUB_TOKEN:-}
  iot-service:
    environment:
      DATA_RETENTION_DAYS: \${DATA_RETENTION_DAYS:-30}
`;

test('environment report exposes safe values but never secret values', () => {
  const secret = 'a-very-private-session-secret-that-must-not-leak';
  const report = buildEnvironmentReport({
    envSource: `PLATFORM_PUBLIC_ORIGIN=https://pxyb.cn\nPLATFORM_SESSION_SECRET=${secret}\nPLATFORM_RELEASE_ACTIONS_ENABLED=false\nDATA_RETENTION_DAYS=45\n`,
    templateSource,
    composeSource,
    checkedAt: '2026-08-13T00:00:00.000Z',
  });

  const publicOrigin = report.variables.find((item) => item.key === 'PLATFORM_PUBLIC_ORIGIN');
  const sessionSecret = report.variables.find((item) => item.key === 'PLATFORM_SESSION_SECRET');
  assert.equal(publicOrigin.displayValue, 'https://pxyb.cn');
  assert.equal(sessionSecret.displayValue, null);
  assert.equal(sessionSecret.sensitive, true);
  assert.equal(sessionSecret.configured, true);
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('environment report distinguishes inactive, missing and restart-required configuration', () => {
  const report = buildEnvironmentReport({
    envSource: 'PLATFORM_PUBLIC_ORIGIN=https://pxyb.cn\nPLATFORM_SESSION_SECRET=short\nPLATFORM_RELEASE_ACTIONS_ENABLED=true\nDATA_RETENTION_DAYS=30\n',
    templateSource,
    composeSource,
    envUpdatedAt: '2026-08-13T10:00:00.000Z',
    runtime: {
      components: [
        { service: 'platform-api', state: 'running', health: 'healthy', startedAt: '2026-08-13T09:00:00.000Z' },
        { service: 'iot-service', state: 'running', health: 'healthy', startedAt: '2026-08-13T11:00:00.000Z' },
      ],
    },
  });

  assert.equal(report.variables.find((item) => item.key === 'PLATFORM_SESSION_SECRET').status, 'invalid');
  assert.equal(report.variables.find((item) => item.key === 'PLATFORM_GITHUB_TOKEN').status, 'missing');
  assert.equal(report.variables.find((item) => item.key === 'PLATFORM_PUBLIC_ORIGIN').runtimeStatus, 'restart_required');
  assert.equal(report.variables.find((item) => item.key === 'DATA_RETENTION_DAYS').runtimeStatus, 'loaded');
  assert.equal(report.summary.restartRequired, 3);
  assert.equal(report.summary.missing, 1);
  assert.equal(report.summary.invalid, 1);
});

test('environment report marks optional feature variables inactive while their feature is disabled', () => {
  const report = buildEnvironmentReport({
    envSource: 'PLATFORM_PUBLIC_ORIGIN=https://pxyb.cn\nPLATFORM_SESSION_SECRET=abcdefghijklmnopqrstuvwxyz123456\nPLATFORM_RELEASE_ACTIONS_ENABLED=false\nDATA_RETENTION_DAYS=30\n',
    templateSource,
    composeSource,
  });

  const githubToken = report.variables.find((item) => item.key === 'PLATFORM_GITHUB_TOKEN');
  assert.equal(githubToken.status, 'inactive');
  assert.equal(githubToken.required, false);
  assert.match(githubToken.detail, /发布功能未启用/);
});

test('environment report includes service ownership, descriptions and group summaries', () => {
  const report = buildEnvironmentReport({
    envSource: 'PLATFORM_PUBLIC_ORIGIN=https://pxyb.cn\nPLATFORM_SESSION_SECRET=abcdefghijklmnopqrstuvwxyz123456\nPLATFORM_RELEASE_ACTIONS_ENABLED=false\nDATA_RETENTION_DAYS=30\n',
    templateSource,
    composeSource,
    runtime: {
      components: [
        { service: 'platform-api', state: 'running', health: 'healthy', startedAt: '2026-08-13T11:00:00.000Z' },
        { service: 'iot-service', state: 'exited', health: 'unknown', startedAt: '2026-08-13T11:00:00.000Z' },
      ],
    },
  });

  const retention = report.variables.find((item) => item.key === 'DATA_RETENTION_DAYS');
  assert.equal(retention.description, 'IoT 数据保留天数。');
  assert.deepEqual(retention.services, ['iot-service']);
  assert.equal(retention.verificationStatus, 'failed');
  assert.ok(report.groups.some((group) => group.id === 'iot' && group.total === 1));
});
