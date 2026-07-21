const assert = require('assert');
const { EventEmitter, once } = require('events');
const test = require('node:test');
const { WebSocket } = require('ws');

process.env.LOG_HTTP_REQUESTS = '0';

const { createApiServer } = require('../src/http/apiServer');
const { hashPassword } = require('../src/security/password');

const TEST_PASSWORD_HASH = hashPassword('secret-password');

let nextPort = 18080;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSettingsStore() {
  const config = {
    api: {
      port: 0,
      deviceOnlineThreshold: 60000
    },
    auth: {
      enabled: true,
      username: 'admin',
      password: TEST_PASSWORD_HASH,
      sessionSecret: 'test-session-secret-with-enough-entropy',
      sessionTtlHours: 1
    },
    dashboard: {
      refreshInterval: 5000,
      dataRetentionDays: 0
    }
  };

  return {
    getConfig: () => clone(config),
    getPublicConfig: () => ({
      config: clone(config),
      secretState: {
        authPasswordConfigured: true,
        authSessionSecretConfigured: true,
        mqttPasswordConfigured: false
      }
    }),
    getPublicDefaults: () => ({
      config: clone(config),
      secretState: {}
    }),
    getConfigPath: () => __filename
  };
}

async function startTestServer(options = {}) {
  const {
    dbOverrides = {},
    automationEngine = null,
    mqttConnected = true,
    mqttSubscribed = true,
    publishControlError = null
  } = options;
  const settingsStore = createSettingsStore();
  const mqttService = new EventEmitter();
  const apiKeyUsages = [];
  const publishedControls = [];

  mqttService.db = {
    verifyApiKey: async (token) => {
      if (token === 'sk_read') {
        return {
          keyId: 'key_read',
          name: 'read key',
          scopes: ['devices:read']
        };
      }

      if (token === 'sk_relay') {
        return {
          keyId: 'key_relay',
          name: 'relay key',
          scopes: ['relays:write']
        };
      }

      return null;
    },
    recordApiKeyUsage: async (keyId) => {
      apiKeyUsages.push(keyId);
    },
    getSensorHistory: async () => [],
    getApiKeys: async () => [],
    addApiKey: async () => ({}),
    deleteApiKey: async () => {},
    cleanOldData: async () => 0,
    ping: async () => true,
    ...dbOverrides
  };
  mqttService.getLatestData = () => ({
    devices: {
      device_1: {
        id: 'device_1',
        name: 'Device 1',
        onlineStatus: 'online',
        lastActive: Date.now(),
        relays: {
          relay_1: 'OFF'
        }
      }
    }
  });
  mqttService.getStatus = () => ({
    mqttConnected,
    subscribed: mqttSubscribed,
    lastMsgTimestamp: Date.now(),
    subscribedTopics: [],
    messagesReceived: 0,
    topicStats: {}
  });
  mqttService.publishControl = async (deviceId, relayId, status) => {
    publishedControls.push({ deviceId, relayId, status });
    if (publishControlError) throw publishControlError;
    return { queuedAt: 12345, qos: 0 };
  };
  mqttService.restart = () => {};
  mqttService.status = { mqttConnected, subscribed: mqttSubscribed };
  mqttService.getDiscoveredTopics = () => [];

  const { closeRealtime, server, wsServer } = createApiServer({ settingsStore, mqttService, automationEngine });
  const port = await listenOnAvailablePort(server);

  return {
    apiKeyUsages,
    baseUrl: `http://127.0.0.1:${port}`,
    closeRealtime,
    mqttService,
    publishedControls,
    server,
    wsServer
  };
}

async function listenOnAvailablePort(server) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = nextPort++;

    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };

        server.once('error', onError);
        server.listen(port, '127.0.0.1', onListening);
      });
      return port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error('Unable to find an available test port.');
}

test('readiness requires MongoDB plus an active MQTT subscription', async (t) => {
  const healthy = await startTestServer();
  const disconnected = await startTestServer({ mqttConnected: false });
  const unsubscribed = await startTestServer({ mqttSubscribed: false });
  t.after(() => Promise.all([
    new Promise((resolve) => healthy.server.close(resolve)),
    new Promise((resolve) => disconnected.server.close(resolve)),
    new Promise((resolve) => unsubscribed.server.close(resolve))
  ]));

  const healthyResponse = await fetch(`${healthy.baseUrl}/api/ready`);
  assert.equal(healthyResponse.status, 200);
  assert.deepEqual(
    await healthyResponse.json(),
    {
      ok: true,
      storage: 'ready',
      mqtt: 'connected',
      subscription: 'subscribed'
    }
  );

  const disconnectedResponse = await fetch(`${disconnected.baseUrl}/api/ready`);
  assert.equal(disconnectedResponse.status, 503);
  assert.equal((await disconnectedResponse.json()).mqtt, 'disconnected');

  const unsubscribedResponse = await fetch(`${unsubscribed.baseUrl}/api/ready`);
  assert.equal(unsubscribedResponse.status, 503);
  assert.equal((await unsubscribedResponse.json()).subscription, 'unsubscribed');
});

test('telemetry endpoints require authentication when auth is enabled', async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/api/devices`, {
    headers: {
      'X-Request-Id': 'test-request-unauthorized'
    }
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-request-id'), 'test-request-unauthorized');
  assert.equal(body.requestId, 'test-request-unauthorized');
  assert.equal(body.code, 'UNAUTHORIZED');
  assert.match(body.error, /登录/);
});

test('api keys are scoped and cannot access console-only endpoints', async (t) => {
  const { apiKeyUsages, baseUrl, server } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const devicesResponse = await fetch(`${baseUrl}/api/devices`, {
    headers: {
      Authorization: 'Bearer sk_read'
    }
  });
  assert.equal(devicesResponse.status, 200);
  assert.deepEqual(Object.keys(await devicesResponse.json()), ['device_1']);
  assert.deepEqual(apiKeyUsages, ['key_read']);

  const configResponse = await fetch(`${baseUrl}/api/config`, {
    headers: {
      Authorization: 'Bearer sk_read'
    }
  });
  assert.equal(configResponse.status, 403);
});

test('automation reads require device scope and mutations require relay scope', async (t) => {
  const calls = [];
  const automationEngine = new EventEmitter();
  automationEngine.listRules = async () => [{ id: 'rule_1' }];
  automationEngine.listScenes = async () => [];
  automationEngine.listRuns = async () => [];
  automationEngine.createRule = async (body) => {
    calls.push(body);
    return { id: 'rule_created', ...body };
  };
  const { baseUrl, server } = await startTestServer({ automationEngine });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const readResponse = await fetch(`${baseUrl}/api/automations/rules`, {
    headers: { Authorization: 'Bearer sk_read' }
  });
  assert.equal(readResponse.status, 200);
  assert.equal((await readResponse.json())[0].id, 'rule_1');

  const deniedResponse = await fetch(`${baseUrl}/api/automations/rules`, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk_read', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Denied' })
  });
  assert.equal(deniedResponse.status, 403);

  const allowedResponse = await fetch(`${baseUrl}/api/automations/rules`, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk_relay', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Allowed' })
  });
  assert.equal(allowedResponse.status, 201);
  assert.equal((await allowedResponse.json()).name, 'Allowed');
  assert.equal(calls.length, 1);
});

test('relay control requires relays:write scope', async (t) => {
  const { baseUrl, publishedControls, server } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const forbiddenResponse = await fetch(`${baseUrl}/api/devices/device_1/relays/relay_1/control`, {
    body: JSON.stringify({ status: 'ON' }),
    headers: {
      Authorization: 'Bearer sk_read',
      'Content-Type': 'application/json'
    },
    method: 'POST'
  });
  assert.equal(forbiddenResponse.status, 403);

  const allowedResponse = await fetch(`${baseUrl}/api/devices/device_1/relays/relay_1/control`, {
    body: JSON.stringify({ status: 'ON' }),
    headers: {
      Authorization: 'Bearer sk_relay',
      Origin: 'http://external-client.example',
      'Content-Type': 'application/json'
    },
    method: 'POST'
  });
  assert.equal(allowedResponse.status, 202);
  const allowedBody = await allowedResponse.json();
  assert.equal(allowedBody.state, 'queued');
  assert.equal(allowedBody.brokerAcknowledged, false);
  assert.equal(allowedBody.deviceConfirmed, false);
  assert.ok(allowedBody.commandId);
  assert.deepEqual(publishedControls, [{ deviceId: 'device_1', relayId: 'relay_1', status: 'ON' }]);
});

test('relay control reports broker publish failures instead of false success', async (t) => {
  const publishError = new Error('broker rejected publish');
  publishError.statusCode = 502;
  publishError.code = 'MQTT_PUBLISH_FAILED';
  publishError.expose = true;
  const { baseUrl, server } = await startTestServer({ publishControlError: publishError });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/api/devices/device_1/relays/relay_1/control`, {
    body: JSON.stringify({ status: 'ON' }),
    headers: {
      Authorization: 'Bearer sk_relay',
      'Content-Type': 'application/json'
    },
    method: 'POST'
  });
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.code, 'REQUEST_FAILED');
  assert.match(body.error, /服务器内部错误/);
});

test('console session can access console-only endpoints', async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({
      username: 'admin',
      password: 'secret-password'
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  });
  assert.equal(loginResponse.status, 200);

  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const configResponse = await fetch(`${baseUrl}/api/config`, {
    headers: {
      Cookie: cookie
    }
  });

  assert.equal(configResponse.status, 200);
  assert.equal((await configResponse.json()).config.auth.enabled, true);
});

test('server errors return a safe request-scoped payload and log diagnostics', async (t) => {
  const previousLogHttpRequests = process.env.LOG_HTTP_REQUESTS;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const logLines = [];

  process.env.LOG_HTTP_REQUESTS = '1';
  console.log = (line) => logLines.push(String(line));
  console.error = (line) => logLines.push(String(line));

  t.after(() => {
    process.env.LOG_HTTP_REQUESTS = previousLogHttpRequests;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  const { baseUrl, server } = await startTestServer({
    dbOverrides: {
      getApiKeys: async () => {
        const error = new Error('database password=secret exploded');
        error.code = 'SQLITE_SECRET';
        throw error;
      }
    }
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({
      username: 'admin',
      password: 'secret-password'
    }),
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl
    },
    method: 'POST'
  });
  assert.equal(loginResponse.status, 200);

  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${baseUrl}/api/keys`, {
    headers: {
      Cookie: cookie,
      'X-Request-Id': 'test-server-error'
    }
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(response.headers.get('x-request-id'), 'test-server-error');
  assert.equal(body.requestId, 'test-server-error');
  assert.equal(body.code, 'INTERNAL_ERROR');
  assert.equal(body.error, '服务器内部错误，请稍后重试。');
  assert.doesNotMatch(body.error, /password=secret/);

  const parsedLogs = logLines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
  const errorLog = parsedLogs.find((entry) => entry.event === 'http_error' && entry.requestId === 'test-server-error');
  const requestLog = parsedLogs.find((entry) => entry.event === 'http_request' && entry.requestId === 'test-server-error');

  assert.ok(errorLog);
  assert.equal(errorLog.code, 'INTERNAL_ERROR');
  assert.equal(errorLog.internalCode, 'SQLITE_SECRET');
  assert.match(errorLog.message, /password=secret/);
  assert.ok(Array.isArray(errorLog.stack));

  assert.ok(requestLog);
  assert.equal(requestLog.statusCode, 500);
  assert.equal(requestLog.errorCode, 'INTERNAL_ERROR');
});

test('cookie session writes reject cross-site origins', async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({
      username: 'admin',
      password: 'secret-password'
    }),
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl
    },
    method: 'POST'
  });
  assert.equal(loginResponse.status, 200);

  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const rejectedResponse = await fetch(`${baseUrl}/api/reconnect`, {
    headers: {
      Cookie: cookie,
      Origin: 'http://evil.example',
      'X-Request-Id': 'test-cross-site'
    },
    method: 'POST'
  });
  const rejectedBody = await rejectedResponse.json();
  assert.equal(rejectedResponse.status, 403);
  assert.equal(rejectedBody.code, 'FORBIDDEN');
  assert.equal(rejectedBody.requestId, 'test-cross-site');

  const sameOriginResponse = await fetch(`${baseUrl}/api/reconnect`, {
    headers: {
      Cookie: cookie,
      Origin: baseUrl
    },
    method: 'POST'
  });
  assert.equal(sameOriginResponse.status, 200);
});

test('same-origin session writes pass behind a trusted reverse proxy', async (t) => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';
  const { baseUrl, server } = await startTestServer();
  if (originalTrustProxy == null) {
    delete process.env.TRUST_PROXY;
  } else {
    process.env.TRUST_PROXY = originalTrustProxy;
  }
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const proxiedOrigin = 'https://mqttapi.example.com';
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({
      username: 'admin',
      password: 'secret-password'
    }),
    headers: {
      'Content-Type': 'application/json',
      Origin: proxiedOrigin,
      'X-Forwarded-Host': 'mqttapi.example.com',
      'X-Forwarded-Proto': 'https'
    },
    method: 'POST'
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Secure/);
});

test('same-origin session writes can use a configured public origin', async (t) => {
  const originalPublicOrigin = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://mqttapi.example.com';
  t.after(() => {
    if (originalPublicOrigin == null) {
      delete process.env.PUBLIC_ORIGIN;
    } else {
      process.env.PUBLIC_ORIGIN = originalPublicOrigin;
    }
  });

  const { baseUrl, server } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({
      username: 'admin',
      password: 'secret-password'
    }),
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://mqttapi.example.com'
    },
    method: 'POST'
  });
  assert.equal(response.status, 200);

  const rejectedResponse = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({
      username: 'admin',
      password: 'secret-password'
    }),
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example'
    },
    method: 'POST'
  });
  assert.equal(rejectedResponse.status, 403);
});

test('realtime updates are coalesced and shutdown closes websocket clients', async () => {
  const { baseUrl, closeRealtime, mqttService, server } = await startTestServer();
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({ username: 'admin', password: 'secret-password' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/ws`, {
    headers: { Cookie: cookie, Origin: baseUrl }
  });
  const messages = [];
  socket.on('message', (payload) => messages.push(JSON.parse(payload.toString())));

  await once(socket, 'open');
  while (messages.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));

  for (let index = 0; index < 20; index += 1) {
    mqttService.emit(index % 2 === 0 ? 'message' : 'status');
  }
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(messages.length, 2);
  assert.equal(messages[0].type, 'snapshot');
  assert.equal(messages[1].type, 'status');

  const closed = once(socket, 'close');
  await closeRealtime();
  const [code] = await closed;
  assert.equal(code, 1001);
  await new Promise((resolve) => server.close(resolve));
});

test('realtime shutdown completes when there are no websocket clients', async () => {
  const { closeRealtime, server } = await startTestServer();
  await closeRealtime();
  await new Promise((resolve) => server.close(resolve));
});
