const ASSIGNMENT_PATTERN = /^([A-Z][A-Z0-9_]*)=(.*)$/;
const COMPOSE_ENV_PATTERN = /\$\{([A-Z][A-Z0-9_]*)(?:(:\?|-|:-|\?)[^}]*)?\}/g;
const PLACEHOLDER_PATTERN = /(?:replace|change)_with_|example\.com|x{6,}|wx_[a-z_]*app_id|generated_(?:hash|key)/i;
const SENSITIVE_KEY_PATTERN = /(?:PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE_KEY|ENCRYPTION_KEY|API_KEY|PASSWORD_HASH|MONGODB_URI|MONGO_URI|COOKIE)/;
const BOOLEAN_KEY_PATTERN = /(?:_ENABLED|_DISABLED|_REQUIRED|_SECURE|_HSTS|_PRE_BACKUP|_ALLOW_MONGODB|_EXPECT_SELF_MOUNT)$/;
const INTEGER_KEY_PATTERN = /(?:_PORT|_MS|_MINUTES|_HOURS|_DAYS|_SECONDS|_BYTES|_SIZE|_ENTRIES|_ATTEMPTS|_THRESHOLD|_PERCENT|_BATCH_SIZE|_GID)$/;
const URL_KEY_PATTERN = /(?:_URL|_ORIGIN|_REGISTRY)$/;

const SECRET_MINIMUMS = new Map([
  ['MONGO_ROOT_PASSWORD', 24],
  ['MONGO_REPLICA_SET_KEY', 40],
  ['MONGO_PLATFORM_PASSWORD', 24],
  ['MONGO_CORE_PASSWORD', 24],
  ['MONGO_EXAM_PASSWORD', 24],
  ['MONGO_CAMPUS_PASSWORD', 24],
  ['MONGO_IOT_PASSWORD', 24],
  ['MONGO_NOTIFICATION_PASSWORD', 24],
  ['MONGO_BACKUP_PASSWORD', 24],
  ['PLATFORM_SESSION_SECRET', 32],
  ['PLATFORM_AUTH_ENCRYPTION_KEY', 43],
  ['PLATFORM_INTERNAL_AUTH_PRIVATE_KEY', 32],
  ['PLATFORM_METRICS_TOKEN', 32],
  ['PLATFORM_BACKUP_RUNNER_TOKEN', 32],
  ['PLATFORM_DEPLOY_HOOK_TOKEN', 32],
  ['PLATFORM_RELEASE_CALLBACK_TOKEN', 32],
  ['CORE_JWT_SECRET', 32],
  ['CORE_ENCRYPTION_KEY', 32],
  ['CORE_WECHAT_APP_SECRET', 16],
  ['EXAM_JWT_SECRET', 32],
  ['EXAM_WECHAT_APP_SECRET', 16],
  ['WECOM_SECRET', 16],
  ['NOTIFY_API_KEY', 32],
  ['NOTIFY_HISTORY_ENCRYPTION_KEY', 32],
  ['HGU_ADMIN_PASSWORD', 12],
  ['HGU_APP_SESSION_SECRET', 32],
  ['HGU_DATA_ENCRYPTION_KEY', 32],
  ['IOT_ADMIN_PASSWORD', 16],
  ['IOT_SESSION_SECRET', 32],
  ['MQTT_PASSWORD', 16],
]);

const CONDITIONAL_REQUIREMENTS = new Map([
  ['PLATFORM_GITHUB_TOKEN', { key: 'PLATFORM_RELEASE_ACTIONS_ENABLED', values: ['true'], detail: '发布功能未启用，无需配置。' }],
  ['PLATFORM_RELEASE_CALLBACK_TOKEN', { key: 'PLATFORM_RELEASE_ACTIONS_ENABLED', values: ['true'], detail: '发布功能未启用，无需配置。' }],
  ['PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY', { key: 'PLATFORM_RELEASE_ACTIONS_ENABLED', values: ['true'], detail: '发布功能未启用，无需配置。' }],
  ['PLATFORM_DEPLOY_HOOK_URL', { key: 'PLATFORM_RELEASE_ACTIONS_ENABLED', values: ['true'], detail: '发布功能未启用，无需配置。' }],
  ['PLATFORM_TURNSTILE_SITE_KEY', { key: 'PLATFORM_TURNSTILE_SECRET_KEY', predicate: 'paired', detail: '未启用 Turnstile，无需配置。' }],
  ['PLATFORM_TURNSTILE_SECRET_KEY', { key: 'PLATFORM_TURNSTILE_SITE_KEY', predicate: 'paired', detail: '未启用 Turnstile，无需配置。' }],
  ['PLATFORM_BACKUP_STORAGE_ENCRYPTION_KEY', { key: 'PLATFORM_BACKUP_SCHEDULE_ENABLED', values: ['true'], detail: '自动异地备份未启用，可暂不配置。' }],
]);

const GROUPS = [
  { id: 'platform', label: '统一平台', matches: ['PLATFORM_', 'TZ'] },
  { id: 'mongodb', label: 'MongoDB', matches: ['MONGO_', 'MONGODB_'] },
  { id: 'core', label: '综合服务', matches: ['CORE_', 'GH_', 'GITHUB_'] },
  { id: 'exam', label: '考试服务', matches: ['EXAM_'] },
  { id: 'notification', label: '通知服务', matches: ['NOTIFY_', 'NOTIFICATION_', 'WECOM_'] },
  { id: 'campus', label: '校园服务', matches: ['HGU_', 'CAMPUS_'] },
  { id: 'iot', label: 'IoT 服务', matches: ['IOT_', 'MQTT_', 'DATA_RETENTION_'] },
  { id: 'deployment', label: '部署与镜像', matches: ['DEPLOY_', 'DEPLOYMENT_', 'COMPOSE_', 'ACR_', '_IMAGE'] },
];

function stripQuotes(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

export function parseEnvironmentSource(source) {
  const values = new Map();
  const duplicates = new Set();
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const match = rawLine.trim().match(ASSIGNMENT_PATTERN);
    if (!match) continue;
    if (values.has(match[1])) duplicates.add(match[1]);
    values.set(match[1], stripQuotes(match[2]));
  }
  return { values, duplicates };
}

export function parseEnvironmentTemplate(source) {
  const catalog = [];
  let comments = [];
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      comments = [];
      continue;
    }
    if (line.startsWith('#')) {
      const comment = line.replace(/^#+\s*/, '').trim();
      if (comment && !/^=+$/.test(comment)) comments.push(comment);
      continue;
    }
    const match = line.match(ASSIGNMENT_PATTERN);
    if (!match) {
      comments = [];
      continue;
    }
    const key = match[1];
    const keyDescription = [...comments].reverse().find((comment) => comment.startsWith(`${key}：`) || comment.startsWith(`${key}:`));
    const fallbackDescription = comments.at(-1) || `${key} 环境变量。`;
    catalog.push({
      key,
      defaultValue: stripQuotes(match[2]),
      description: (keyDescription || fallbackDescription).replace(new RegExp(`^${key}[：:]\\s*`), '').trim(),
    });
    comments = [];
  }
  return catalog;
}

export function parseComposeOwnership(source) {
  const ownership = new Map();
  let service = '';
  let inServices = false;
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    if (/^services:\s*$/.test(rawLine)) {
      inServices = true;
      continue;
    }
    const serviceMatch = inServices ? rawLine.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/) : null;
    if (serviceMatch) service = serviceMatch[1];
    if (!service) continue;
    for (const match of rawLine.matchAll(COMPOSE_ENV_PATTERN)) {
      const key = match[1];
      const entry = ownership.get(key) || { services: new Set(), required: false };
      entry.services.add(service);
      if (match[2] === ':?' || match[2] === '?') entry.required = true;
      ownership.set(key, entry);
    }
  }
  return ownership;
}

function groupForKey(key) {
  const matched = GROUPS.find((group) => group.matches.some((prefix) => prefix.startsWith('_') ? key.endsWith(prefix) : key.startsWith(prefix) || key === prefix));
  return matched || { id: 'other', label: '其他配置' };
}

function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERN.test(key) && !/(?:PUBLIC_KEY|SITE_KEY|CERT_SHA256)$/.test(key);
}

function conditionalState(key, values) {
  const rule = CONDITIONAL_REQUIREMENTS.get(key);
  if (!rule) return null;
  const dependency = String(values.get(rule.key) || '').trim().toLowerCase();
  const active = rule.predicate === 'paired' ? Boolean(dependency) : rule.values.includes(dependency);
  return { active, detail: rule.detail };
}

function validateValue(key, value) {
  if (!value) return '';
  if (PLACEHOLDER_PATTERN.test(value)) return '仍为示例或占位值。';
  const minimum = SECRET_MINIMUMS.get(key);
  if (minimum && value.length < minimum) return `长度不足，至少需要 ${minimum} 个字符。`;
  if (BOOLEAN_KEY_PATTERN.test(key) && !['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(value.toLowerCase())) {
    return '必须使用明确的布尔值。';
  }
  if (INTEGER_KEY_PATTERN.test(key) && !/^\d+$/.test(value)) return '必须是非负整数。';
  if (URL_KEY_PATTERN.test(key) && !key.endsWith('_HOSTS')) {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:', 'mqtt:', 'mqtts:', 'mongodb:'].includes(parsed.protocol)) return '协议不受支持。';
    } catch {
      return '必须是包含协议的有效地址。';
    }
  }
  if (key === 'PLATFORM_AUTH_ENCRYPTION_KEY' || key === 'PLATFORM_BACKUP_STORAGE_ENCRYPTION_KEY') {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || Buffer.from(value, 'base64url').length !== 32) return '必须是 32 字节 Base64URL 密钥。';
  }
  return '';
}

function runtimeState(services, runtime, envUpdatedAt, configured, active) {
  if (!active || !configured || !services.length) return 'not_applicable';
  const byService = new Map((runtime?.components || []).map((component) => [component.service, component]));
  const observed = services.map((service) => byService.get(service)).filter(Boolean);
  if (!observed.length) return 'not_observed';
  const updated = Date.parse(envUpdatedAt || '');
  if (Number.isFinite(updated) && observed.some((component) => {
    const started = Date.parse(component.startedAt || '');
    return Number.isFinite(started) && started < updated;
  })) return 'restart_required';
  return 'loaded';
}

function verificationState(services, runtime, active) {
  if (!active || !services.length) return 'not_applicable';
  const byService = new Map((runtime?.components || []).map((component) => [component.service, component]));
  const observed = services.map((service) => byService.get(service)).filter(Boolean);
  if (!observed.length) return 'unknown';
  const healthy = (component) => component.state === 'running' && ['healthy', 'not_configured', 'running'].includes(component.health || 'not_configured');
  return observed.length === services.length && observed.every(healthy) ? 'passed' : 'failed';
}

function summarize(variables) {
  const summary = {
    total: variables.length,
    healthy: 0,
    missing: 0,
    invalid: 0,
    inactive: 0,
    unused: 0,
    restartRequired: 0,
    verificationFailed: 0,
  };
  for (const variable of variables) {
    if (variable.status === 'valid') summary.healthy += 1;
    if (Object.hasOwn(summary, variable.status)) summary[variable.status] += 1;
    if (variable.runtimeStatus === 'restart_required') summary.restartRequired += 1;
    if (variable.verificationStatus === 'failed') summary.verificationFailed += 1;
  }
  summary.state = summary.missing || summary.invalid || summary.verificationFailed
    ? 'attention'
    : summary.restartRequired ? 'restart_required' : 'healthy';
  return summary;
}

export function buildEnvironmentReport({
  envSource,
  templateSource,
  composeSource,
  envUpdatedAt = null,
  runtime = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const { values, duplicates } = parseEnvironmentSource(envSource);
  const catalog = parseEnvironmentTemplate(templateSource);
  const ownership = parseComposeOwnership(composeSource);
  const catalogKeys = new Set(catalog.map((item) => item.key));
  for (const key of values.keys()) {
    if (!catalogKeys.has(key)) catalog.push({ key, defaultValue: '', description: '当前部署中存在，但模板尚未记录用途。' });
  }

  const variables = catalog.map((item) => {
    const ownershipEntry = ownership.get(item.key);
    const services = [...(ownershipEntry?.services || [])].sort();
    const value = values.get(item.key) || '';
    const configured = Boolean(value);
    const conditional = conditionalState(item.key, values);
    const active = conditional ? conditional.active : true;
    const required = active && Boolean(ownershipEntry?.required || (conditional && conditional.active));
    const validationError = duplicates.has(item.key) ? '变量重复定义。' : validateValue(item.key, value);
    let status = 'valid';
    let detail = '配置格式有效。';
    if (!services.length) {
      status = 'unused';
      detail = '当前 Compose 未引用，可能是本地工具配置或已不再使用。';
    } else if (!active) {
      status = 'inactive';
      detail = conditional.detail;
    } else if (!configured && required) {
      status = 'missing';
      detail = '当前功能需要该变量，但尚未配置。';
    } else if (validationError) {
      status = 'invalid';
      detail = validationError;
    } else if (!configured) {
      status = 'inactive';
      detail = '可选变量未配置，当前使用默认行为。';
    }
    const sensitive = isSensitiveKey(item.key);
    const group = groupForKey(item.key);
    const runtimeStatus = runtimeState(services, runtime, envUpdatedAt, configured, active);
    return {
      key: item.key,
      description: item.description,
      group: group.id,
      groupLabel: group.label,
      services,
      sensitive,
      required,
      configured,
      status,
      detail,
      displayValue: sensitive || !configured ? null : value,
      runtimeStatus,
      verificationStatus: verificationState(services, runtime, active),
      restartRequired: runtimeStatus === 'restart_required',
    };
  });
  const summary = summarize(variables);
  const groups = [...new Map(variables.map((variable) => [variable.group, variable.groupLabel])).entries()].map(([id, label]) => {
    const rows = variables.filter((variable) => variable.group === id);
    const groupSummary = summarize(rows);
    return { id, label, ...groupSummary };
  });
  return {
    checkedAt,
    envUpdatedAt,
    source: 'deployment',
    summary,
    groups,
    variables,
  };
}
