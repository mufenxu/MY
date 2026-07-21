import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

function decodeKey(value) {
  const key = Buffer.from(String(value || ''), 'base64url');
  if (key.length !== 32) throw new Error('PLATFORM_AUTH_ENCRYPTION_KEY must be a Base64URL-encoded 32-byte key.');
  return key;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().slice(0, 128);
}

function dimensionId(kind, value, key) {
  return crypto.createHmac('sha256', key).update(`${kind}:${String(value || '')}`).digest('base64url');
}

function dimensions({ username, ip }, key) {
  return [
    { id: dimensionId('account', normalizeUsername(username), key), kind: 'account' },
    { id: dimensionId('ip', String(ip || ''), key), kind: 'ip' },
    { id: dimensionId('global', 'login', key), kind: 'global' },
  ];
}

function createPolicy(options = {}) {
  return {
    windowMs: Math.max(Number(options.windowMinutes) || 15, 1) * 60_000,
    maxAttempts: Math.max(Number(options.maxAttempts) || 10, 3),
    challengeThreshold: Math.max(Number(options.challengeThreshold) || 3, 2),
    backoffBaseMs: Math.max(Number(options.backoffBaseMs) || 1000, 250),
    backoffMaxMs: Math.max(Number(options.backoffMaxMs) || 15 * 60_000, 10_000),
  };
}

function activeState(state, timestamp, policy) {
  if (!state || new Date(state.windowStartedAt).getTime() + policy.windowMs <= timestamp) {
    return { failures: 0, blockedUntil: null, windowStartedAt: new Date(timestamp) };
  }
  return state;
}

function summarize(states, timestamp, policy, challengeConfigured) {
  const account = activeState(states.find((state) => state.kind === 'account'), timestamp, policy);
  const ip = activeState(states.find((state) => state.kind === 'ip'), timestamp, policy);
  const global = activeState(states.find((state) => state.kind === 'global'), timestamp, policy);
  const blockedUntilMs = Math.max(
    new Date(account.blockedUntil || 0).getTime() || 0,
    new Date(ip.blockedUntil || 0).getTime() || 0,
  );
  const suspicious = Math.max(account.failures || 0, ip.failures || 0) >= policy.challengeThreshold
    || (global.failures || 0) >= policy.challengeThreshold * 10;
  return {
    blocked: blockedUntilMs > timestamp,
    blockedUntil: blockedUntilMs > timestamp ? new Date(blockedUntilMs).toISOString() : null,
    retryAfterSeconds: blockedUntilMs > timestamp ? Math.max(Math.ceil((blockedUntilMs - timestamp) / 1000), 1) : 0,
    challengeRequired: Boolean(challengeConfigured && suspicious),
    failures: Math.max(account.failures || 0, ip.failures || 0),
  };
}

function nextFailure(state, timestamp, policy) {
  const current = activeState(state, timestamp, policy);
  const failures = (current.failures || 0) + 1;
  const exponent = Math.max(failures - policy.challengeThreshold, 0);
  const delay = failures >= policy.challengeThreshold
    ? Math.min(policy.backoffBaseMs * (2 ** Math.min(exponent, 20)), policy.backoffMaxMs)
    : 0;
  return {
    failures,
    windowStartedAt: new Date(current.windowStartedAt),
    blockedUntil: delay ? new Date(timestamp + delay) : null,
    expiresAt: new Date(timestamp + policy.windowMs + policy.backoffMaxMs),
  };
}

export function createMemoryAuthRiskStore({ encryptionKey, challengeConfigured = false, now = () => Date.now(), ...options } = {}) {
  const key = decodeKey(encryptionKey);
  const policy = createPolicy(options);
  const states = new Map();

  function read(input) {
    return dimensions(input, key).map(({ id, kind }) => ({ id, kind, ...(states.get(id) || {}) }));
  }

  return {
    async assess(input) {
      return summarize(read(input), now(), policy, challengeConfigured);
    },
    async recordFailure(input) {
      const timestamp = now();
      for (const dimension of dimensions(input, key)) {
        states.set(dimension.id, { kind: dimension.kind, ...nextFailure(states.get(dimension.id), timestamp, policy) });
      }
      const result = summarize(read(input), timestamp, policy, challengeConfigured);
      return {
        ...result,
        alert: result.failures === policy.challengeThreshold || result.failures === policy.maxAttempts,
      };
    },
    async recordSuccess(input) {
      const list = dimensions(input, key);
      states.delete(list[0].id);
      states.delete(list[1].id);
    },
    async ping() { return true; },
    async close() {},
  };
}

export async function createMongoAuthRiskStore({
  uri,
  encryptionKey,
  challengeConfigured = false,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  now = () => Date.now(),
  ...options
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const key = decodeKey(encryptionKey);
  const policy = createPolicy(options);
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const attempts = db.collection('auth_attempts');
  await attempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  async function read(input) {
    const list = dimensions(input, key);
    const rows = await attempts.find({ _id: { $in: list.map(({ id }) => id) } }).toArray();
    return list.map(({ id, kind }) => ({ id, kind, ...(rows.find((row) => row._id === id) || {}) }));
  }

  return {
    async assess(input) {
      return summarize(await read(input), now(), policy, challengeConfigured);
    },
    async recordFailure(input) {
      const timestamp = now();
      const timestampDate = new Date(timestamp);
      const staleBefore = new Date(timestamp - policy.windowMs);
      await Promise.all(dimensions(input, key).map(async (dimension) => {
        const staleWindow = {
          $or: [
            { $eq: [{ $type: '$windowStartedAt' }, 'missing'] },
            { $lte: [{ $ifNull: ['$windowStartedAt', new Date(0)] }, staleBefore] },
          ],
        };
        await attempts.updateOne({ _id: dimension.id }, [
          {
            $set: {
              kind: dimension.kind,
              windowStartedAt: { $cond: [staleWindow, timestampDate, '$windowStartedAt'] },
              failures: { $cond: [staleWindow, 1, { $add: [{ $ifNull: ['$failures', 0] }, 1] }] },
            },
          },
          {
            $set: {
              blockedUntil: {
                $cond: [
                  { $gte: ['$failures', policy.challengeThreshold] },
                  {
                    $dateAdd: {
                      startDate: timestampDate,
                      unit: 'millisecond',
                      amount: {
                        $min: [
                          policy.backoffMaxMs,
                          {
                            $multiply: [
                              policy.backoffBaseMs,
                              { $pow: [2, { $min: [20, { $subtract: ['$failures', policy.challengeThreshold] }] }] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  null,
                ],
              },
              expiresAt: new Date(timestamp + policy.windowMs + policy.backoffMaxMs),
            },
          },
        ], { upsert: true });
      }));
      const result = summarize(await read(input), timestamp, policy, challengeConfigured);
      return {
        ...result,
        alert: result.failures === policy.challengeThreshold || result.failures === policy.maxAttempts,
      };
    },
    async recordSuccess(input) {
      const list = dimensions(input, key).filter(({ kind }) => kind !== 'global');
      await attempts.deleteMany({ _id: { $in: list.map(({ id }) => id) } });
    },
    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() { await client.close(); },
  };
}
