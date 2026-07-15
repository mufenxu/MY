const assert = require('assert');
const { EventEmitter } = require('events');
const test = require('node:test');

process.env.LOG_HTTP_REQUESTS = '0';

const { createApiServer } = require('../src/http/apiServer');

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
      password: 'secret-password',
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
  const { dbOverrides = {} } = options;
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
    mqttConnected: true,
    subscribed: true,
    lastMsgTimestamp: Date.now(),
    subscribedTopics: [],
    messagesReceived: 0,
    topicStats: {}
  });
  mqttService.publishControl = (deviceId, relayId, status) => {
    publishedControls.push({ deviceId, relayId, status });
  };
  mqttService.restart = () => {};
  mqttService.getDiscoveredTopics = () => [];

  const { server } = createApiServer({ settingsStore, mqttService });
  const port = await listenOnAvailablePort(server);

  return {
    apiKeyUsages,
    baseUrl: `http://127.0.0.1:${port}`,
    publishedControls,
    server
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
  assert.equal(allowedResponse.status, 200);
  assert.deepEqual(publishedControls, [{ deviceId: 'device_1', relayId: 'relay_1', status: 'ON' }]);
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
