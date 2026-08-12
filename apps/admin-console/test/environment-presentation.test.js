import assert from 'node:assert/strict';
import test from 'node:test';
import {
  environmentConclusion,
  environmentStatusMeta,
  filterEnvironmentVariables,
} from '../src/client/environment-presentation.js';

const variables = [
  {
    key: 'PLATFORM_SESSION_SECRET', description: '平台会话密钥', group: 'platform',
    services: ['platform-api'], status: 'valid', runtimeStatus: 'loaded', verificationStatus: 'passed',
  },
  {
    key: 'MQTT_PASSWORD', description: 'MQTT 连接密码', group: 'iot',
    services: ['iot-service'], status: 'missing', runtimeStatus: 'not_applicable', verificationStatus: 'failed',
  },
];

test('environment presentation filters by text, group and status', () => {
  assert.deepEqual(filterEnvironmentVariables(variables, { query: 'mqtt', group: 'all', status: 'all' }).map((item) => item.key), ['MQTT_PASSWORD']);
  assert.deepEqual(filterEnvironmentVariables(variables, { query: '平台', group: 'platform', status: 'valid' }).map((item) => item.key), ['PLATFORM_SESSION_SECRET']);
  assert.deepEqual(filterEnvironmentVariables(variables, { query: '', group: 'iot', status: 'attention' }).map((item) => item.key), ['MQTT_PASSWORD']);
});

test('environment presentation gives plain-language status and summary conclusions', () => {
  assert.equal(environmentStatusMeta('missing').label, '缺少配置');
  assert.equal(environmentStatusMeta('invalid').tone, 'failed');
  assert.equal(environmentConclusion({ available: false }), '环境诊断暂不可用');
  assert.equal(environmentConclusion({ available: true, state: 'attention', missing: 1, invalid: 0, verificationFailed: 1 }), '2 项配置需要处理');
  assert.equal(environmentConclusion({ available: true, state: 'restart_required', restartRequired: 3 }), '3 项配置等待服务重启');
  assert.equal(environmentConclusion({ available: true, state: 'healthy' }), '环境配置正常');
});
