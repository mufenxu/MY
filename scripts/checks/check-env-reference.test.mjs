import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectEnvReference,
  loadEnvReferenceInputs,
  parseCatalogKeys,
  parseEnvExampleKeys,
} from './check-env-reference.mjs';

test('Android 环境变量对照表覆盖 .env.example 的全部变量', () => {
  assert.deepEqual(inspectEnvReference(loadEnvReferenceInputs()), []);
});

test('模板解析同时收录生效变量与注释掉的可选变量，忽略说明文字', () => {
  const keys = parseEnvExampleKeys([
    '# 说明：TZ=Asia/Shanghai 这类写在句子里的不算',
    '# CORE_TRUST_PROXY / EXAM_TRUST_PROXY: keep 1',
    'TZ=Asia/Shanghai',
    '# CMCC_WS_URL=wss://example.invalid/ws',
    'ACR_PASSWORD=',
  ].join('\n'));

  assert.deepEqual(keys, ['TZ', 'CMCC_WS_URL', 'ACR_PASSWORD']);
});

test('对照表解析只取三种构造函数的第一个字面量', () => {
  const keys = parseCatalogKeys([
    'required("MQTT_URL", "MQTT 服务器地址", "见 MQTT_USERNAME 的说明"),',
    'keep(',
    '    "TZ", "容器时区", "…", example = "Asia/Shanghai"),',
    'optional("ACR_PASSWORD", "镜像仓库固定密码", "…", secret = true),',
  ].join('\n'));

  assert.deepEqual(keys, ['MQTT_URL', 'TZ', 'ACR_PASSWORD']);
});

test('缺失、多余与重复的变量分别报告', () => {
  const errors = inspectEnvReference({
    envExample: 'TZ=Asia/Shanghai\nMQTT_URL=\n',
    catalog: 'keep("TZ", "a", "b"),\nkeep("TZ", "a", "b"),\noptional("REMOVED_KEY", "a", "b"),',
  });

  assert.deepEqual(errors, [
    'Android 环境变量对照表缺少 .env.example 中的 MQTT_URL',
    'Android 环境变量对照表多出 .env.example 中不存在的 REMOVED_KEY',
    'Android 环境变量对照表重复登记了 TZ',
  ]);
});
