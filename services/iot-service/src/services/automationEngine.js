const crypto = require('crypto');
const { EventEmitter } = require('events');

const RULE_OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);
const NUMERIC_METRICS = new Set(['temperature', 'humidity']);
const ALL_METRICS = new Set([...NUMERIC_METRICS, 'online', 'relay']);

function badRequest(message, code = 'INVALID_AUTOMATION') {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  error.expose = true;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = 'AUTOMATION_NOT_FOUND';
  error.expose = true;
  return error;
}

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80) throw badRequest('Name must contain 1 to 80 characters.');
  return name;
}

function getConfiguredDevice(settingsStore, deviceId) {
  return (settingsStore.getConfig().devices || []).find((device) => device.id === deviceId);
}

function validateDevice(settingsStore, deviceId) {
  const normalized = String(deviceId || '').trim();
  const device = getConfiguredDevice(settingsStore, normalized);
  if (!device) throw badRequest(`Unknown device: ${normalized || '(empty)'}`, 'UNKNOWN_DEVICE');
  return device;
}

function normalizeAction(settingsStore, input) {
  const device = validateDevice(settingsStore, input?.deviceId);
  const relayId = String(input?.relayId || '').trim();
  if (!(device.relays || []).some((relay) => relay.id === relayId)) {
    throw badRequest(`Unknown relay ${relayId || '(empty)'} on device ${device.id}.`, 'UNKNOWN_RELAY');
  }
  const status = String(input?.status || '').trim().toUpperCase();
  if (!['ON', 'OFF'].includes(status)) throw badRequest('Relay status must be ON or OFF.');
  return { deviceId: device.id, relayId, status };
}

function normalizeActions(settingsStore, input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 16) {
    throw badRequest('An automation must contain between 1 and 16 actions.');
  }
  return input.map((action) => normalizeAction(settingsStore, action));
}

function normalizeCondition(settingsStore, input) {
  const device = validateDevice(settingsStore, input?.deviceId);
  const metric = String(input?.metric || '').trim();
  const operator = String(input?.operator || '').trim();
  if (!ALL_METRICS.has(metric)) throw badRequest('Unsupported automation metric.');
  if (!RULE_OPERATORS.has(operator)) throw badRequest('Unsupported comparison operator.');

  let relayId = null;
  if (metric === 'relay') {
    relayId = String(input?.relayId || '').trim();
    if (!(device.relays || []).some((relay) => relay.id === relayId)) {
      throw badRequest(`Unknown relay ${relayId || '(empty)'} on device ${device.id}.`, 'UNKNOWN_RELAY');
    }
  }

  let value = input?.value;
  if (NUMERIC_METRICS.has(metric)) {
    value = Number(value);
    if (!Number.isFinite(value)) throw badRequest('Numeric rule values must be finite numbers.');
  } else {
    value = String(value || '').trim().toUpperCase();
    const allowedValues = metric === 'online' ? ['ONLINE', 'OFFLINE'] : ['ON', 'OFF'];
    if (!allowedValues.includes(value)) throw badRequest(`Rule value must be ${allowedValues.join(' or ')}.`);
    if (!['eq', 'neq'].includes(operator)) throw badRequest('State rules only support eq and neq operators.');
  }

  return { deviceId: device.id, metric, operator, value, ...(relayId ? { relayId } : {}) };
}

function normalizeRule(settingsStore, input, existing = null) {
  const now = Date.now();
  const cooldownSeconds = Number(input?.cooldownSeconds ?? 300);
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 5 || cooldownSeconds > 86400) {
    throw badRequest('Cooldown must be an integer between 5 and 86400 seconds.');
  }
  return {
    id: existing?.id || `rule_${crypto.randomUUID()}`,
    name: normalizeName(input?.name),
    enabled: input?.enabled !== false,
    condition: normalizeCondition(settingsStore, input?.condition),
    actions: normalizeActions(settingsStore, input?.actions),
    cooldown_seconds: cooldownSeconds,
    version: (existing?.version || 0) + 1,
    created_at: existing?.created_at || now,
    updated_at: now,
    last_triggered_at: existing?.last_triggered_at || null
  };
}

function normalizeScene(settingsStore, input, existing = null) {
  const now = Date.now();
  return {
    id: existing?.id || `scene_${crypto.randomUUID()}`,
    name: normalizeName(input?.name),
    actions: normalizeActions(settingsStore, input?.actions),
    version: (existing?.version || 0) + 1,
    created_at: existing?.created_at || now,
    updated_at: now
  };
}

function readConditionValue(latest, condition) {
  const device = latest?.devices?.[condition.deviceId];
  if (!device) return undefined;
  if (condition.metric === 'temperature') return device.temp;
  if (condition.metric === 'humidity') return device.hum;
  if (condition.metric === 'online') return String(device.onlineStatus || '').toUpperCase();
  return String(device.relays?.[condition.relayId] || '').toUpperCase();
}

function matchesCondition(latest, condition) {
  const actual = readConditionValue(latest, condition);
  if (actual === undefined || actual === null || actual === '') return false;
  const expected = condition.value;
  if (condition.operator === 'gt') return Number(actual) > Number(expected);
  if (condition.operator === 'gte') return Number(actual) >= Number(expected);
  if (condition.operator === 'lt') return Number(actual) < Number(expected);
  if (condition.operator === 'lte') return Number(actual) <= Number(expected);
  if (condition.operator === 'eq') return actual === expected;
  return actual !== expected;
}

class AutomationEngine extends EventEmitter {
  constructor({ settingsStore, mqttService, database = mqttService.db, now = () => Date.now() }) {
    super();
    this.settingsStore = settingsStore;
    this.mqttService = mqttService;
    this.db = database;
    this.now = now;
    this.ruleMatches = new Map();
    this.evaluationQueue = Promise.resolve();
    this.started = false;
    this.onMqttMessage = ({ latest } = {}) => {
      this.evaluationQueue = this.evaluationQueue
        .then(() => this.evaluate(latest || this.mqttService.getLatestData()))
        .catch((error) => console.error('Automation evaluation failed:', error.message));
    };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.mqttService.on('message', this.onMqttMessage);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.mqttService.off('message', this.onMqttMessage);
  }

  async listRules() { return this.db.listAutomationRules(); }
  async listScenes() { return this.db.listAutomationScenes(); }
  async listRuns(limit) { return this.db.listAutomationRuns(limit); }

  async createRule(input) {
    return this.db.saveAutomationRule(normalizeRule(this.settingsStore, input));
  }

  async updateRule(id, input) {
    const existing = await this.db.getAutomationRule(id);
    if (!existing) throw notFound('Automation rule not found.');
    const saved = await this.db.saveAutomationRule(normalizeRule(this.settingsStore, {
      name: input.name ?? existing.name,
      enabled: input.enabled ?? existing.enabled,
      condition: input.condition ?? existing.condition,
      actions: input.actions ?? existing.actions,
      cooldownSeconds: input.cooldownSeconds ?? existing.cooldown_seconds
    }, existing));
    if (!saved.enabled) this.ruleMatches.delete(id);
    return saved;
  }

  async deleteRule(id) {
    if (!await this.db.deleteAutomationRule(id)) throw notFound('Automation rule not found.');
    this.ruleMatches.delete(id);
  }

  async createScene(input) {
    return this.db.saveAutomationScene(normalizeScene(this.settingsStore, input));
  }

  async updateScene(id, input) {
    const existing = await this.db.getAutomationScene(id);
    if (!existing) throw notFound('Automation scene not found.');
    return this.db.saveAutomationScene(normalizeScene(this.settingsStore, {
      name: input.name ?? existing.name,
      actions: input.actions ?? existing.actions
    }, existing));
  }

  async deleteScene(id) {
    if (!await this.db.deleteAutomationScene(id)) throw notFound('Automation scene not found.');
  }

  async runScene(id, actor = 'web_ui') {
    const scene = await this.db.getAutomationScene(id);
    if (!scene) throw notFound('Automation scene not found.');
    return this.executeActions('scene', scene, actor);
  }

  async evaluate(latest) {
    const rules = await this.db.listAutomationRules();
    const now = this.now();
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const matches = matchesCondition(latest, rule.condition);
      const wasMatching = this.ruleMatches.get(rule.id) === true;
      this.ruleMatches.set(rule.id, matches);
      if (!matches || wasMatching) continue;
      if (rule.last_triggered_at && now - rule.last_triggered_at < rule.cooldown_seconds * 1000) continue;
      await this.executeActions('rule', rule, 'automation');
      rule.last_triggered_at = now;
      await this.db.recordAutomationRuleRun(rule.id, now);
    }
  }

  async executeActions(sourceType, source, actor) {
    const run = {
      id: `run_${crypto.randomUUID()}`,
      source_type: sourceType,
      source_id: source.id,
      source_name: source.name,
      actor,
      state: 'commands_queued',
      device_confirmed: false,
      results: [],
      created_at: this.now()
    };

    for (const action of source.actions) {
      try {
        const result = await this.mqttService.publishControl(
          action.deviceId,
          action.relayId,
          action.status,
          { triggeredBy: sourceType === 'rule' ? `automation_rule:${source.id}` : `automation_scene:${source.id}` }
        );
        run.results.push({ ...action, state: 'queued', queued_at: result.queuedAt, broker_acknowledged: result.qos > 0 });
      } catch (error) {
        run.results.push({ ...action, state: 'failed', code: error.code || 'PUBLISH_FAILED', message: error.message });
      }
    }

    const failures = run.results.filter((result) => result.state === 'failed').length;
    if (failures === run.results.length) run.state = 'failed';
    else if (failures > 0) run.state = 'partially_queued';
    await this.db.saveAutomationRun(run);
    this.emit('run', run);
    return run;
  }
}

module.exports = {
  AutomationEngine,
  matchesCondition,
  normalizeAction,
  normalizeCondition,
  normalizeRule,
  normalizeScene
};
