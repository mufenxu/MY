import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.argv[2] || '.env');
const source = fs.readFileSync(envPath, 'utf8');
const values = new Map();
const errors = [];

for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator <= 0) {
    errors.push(`line ${index + 1} is not a valid KEY=value assignment`);
    continue;
  }
  const key = line.slice(0, separator).trim();
  let value = line.slice(separator + 1).trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
  }
  if (values.has(key)) errors.push(`duplicate environment key: ${key}`);
  values.set(key, value);
}

const policies = new Map([
  ['MONGO_ROOT_PASSWORD', 24],
  ['MONGO_REPLICA_SET_KEY', 40],
  ['MONGO_PLATFORM_PASSWORD', 24],
  ['MONGO_CORE_PASSWORD', 24],
  ['MONGO_EXAM_PASSWORD', 24],
  ['MONGO_CAMPUS_PASSWORD', 24],
  ['MONGO_IOT_PASSWORD', 24],
  ['MONGO_BACKUP_PASSWORD', 24],
  ['PLATFORM_SESSION_SECRET', 32],
  ['PLATFORM_INTERNAL_AUTH_PRIVATE_KEY', 32],
  ['PLATFORM_METRICS_TOKEN', 32],
  ['PLATFORM_BACKUP_RUNNER_TOKEN', 32],
  ['CORE_JWT_SECRET', 32],
  ['CORE_WECHAT_APP_SECRET', 16],
  ['EXAM_JWT_SECRET', 32],
  ['EXAM_WECHAT_APP_SECRET', 16],
  ['WECOM_SECRET', 16],
  ['NOTIFY_API_KEY', 32],
  ['HGU_ADMIN_PASSWORD', 12],
  ['HGU_APP_SESSION_SECRET', 32],
  ['HGU_DATA_ENCRYPTION_KEY', 32],
  ['IOT_ADMIN_PASSWORD', 16],
  ['IOT_SESSION_SECRET', 32],
]);
const optionalPolicies = new Map([
  ['GH_TOKEN', 20],
  ['GH_WEBHOOK_SECRET', 16],
  ['MQTT_API_KEY', 16],
  ['MQTT_PASSWORD', 16],
  ['SUB2API_API_KEY', 16],
  ['EXAM_DEFAULT_ADMIN_PASSWORD', 10],
]);
const placeholderPattern = /(?:replace|change)_with_|example\.com|x{6,}/i;

for (const [key, minLength] of policies) {
  const value = values.get(key) || '';
  if (!value) errors.push(`missing required secret: ${key}`);
  else if (value.length < minLength) errors.push(`${key} must contain at least ${minLength} characters`);
  else if (placeholderPattern.test(value)) errors.push(`${key} still contains a template value`);
}
for (const [key, minLength] of optionalPolicies) {
  const value = values.get(key) || '';
  if (value && (value.length < minLength || placeholderPattern.test(value))) {
    errors.push(`${key} is configured but does not meet its minimum strength`);
  }
}

const encryptionKey = values.get('CORE_ENCRYPTION_KEY') || '';
if (encryptionKey.length < 32 || placeholderPattern.test(encryptionKey)) {
  errors.push('CORE_ENCRYPTION_KEY must contain at least 32 non-template characters');
}

const owners = new Map();
for (const key of [...policies.keys(), 'CORE_ENCRYPTION_KEY', ...optionalPolicies.keys()]) {
  const value = values.get(key) || '';
  if (!value) continue;
  const previous = owners.get(value);
  if (previous) errors.push(`${key} must not reuse the value assigned to ${previous}`);
  else owners.set(value, key);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${path.basename(envPath)} contains distinct, non-template deployment secrets.`);
