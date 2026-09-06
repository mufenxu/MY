import { MongoClient } from 'mongodb';
import { createMongoAuthStore } from './auth-store.js';
import { createMongoAuthRiskStore } from './auth-risk-store.js';
import { createMongoSessionRegistry } from './mongo-session-registry.js';
import { createMongoOperationsStore } from './operations-store.js';
import { createMongoReleaseStore } from './release-store.js';
import { createMongoConfigurationStore } from './configuration-store.js';
import { createMongoQrLoginStore } from './qr-login-store.js';
import { createMongoWebLoginTicketStore } from './web-login-ticket-store.js';
import { createMongoGoogleAccountStore } from './google-account-store.js';
import { createMongoExternalApplicationStore } from './external-application-store.js';

const DEFAULT_FACTORIES = {
  createMongoAuthStore,
  createMongoAuthRiskStore,
  createMongoSessionRegistry,
  createMongoOperationsStore,
  createMongoReleaseStore,
  createMongoConfigurationStore,
  createMongoQrLoginStore,
  createMongoWebLoginTicketStore,
  createMongoGoogleAccountStore,
  createMongoExternalApplicationStore,
};

const STORE_NAMES = [
  'authStore',
  'authRiskStore',
  'sessionRegistry',
  'operationsStore',
  'releaseStore',
  'configurationStore',
  'qrLoginStore',
  'webLoginTicketStore',
  'googleAccountStore',
  'externalApplicationStore',
];

export async function closePortalStores(stores = {}) {
  const results = await Promise.allSettled(
    STORE_NAMES
      .filter((name) => typeof stores[name]?.close === 'function')
      .map((name) => Promise.resolve().then(() => stores[name].close())),
  );
  if (stores.mongoClient) {
    try { await stores.mongoClient.close(); } catch (error) { results.push({ status: 'rejected', reason: error }); }
  }
  return results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
}

export async function pingPortalStores(stores = {}) {
  if (stores.mongoClient) return (await stores.mongoClient.db().command({ ping: 1 })).ok === 1;
  const results = await Promise.all(
    STORE_NAMES
      .filter((name) => typeof stores[name]?.ping === 'function')
      .map((name) => Promise.resolve().then(() => stores[name].ping())),
  );
  return results.every(Boolean);
}

export async function createPersistentPortalStores({
  config,
  factories = DEFAULT_FACTORIES,
  clientFactory = (uri) => new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 }),
} = {}) {
  const stores = Object.fromEntries(STORE_NAMES.map((name) => [name, null]));
  if (!config?.mongoUri) return stores;

  const definitions = [
    ['authStore', factories.createMongoAuthStore, {
      uri: config.mongoUri,
      encryptionKey: config.authEncryptionKey,
      issuer: config.webauthnRpName,
      bootstrap: {
        username: config.adminUsername,
        passwordHash: config.adminPasswordHash,
        role: config.adminRole,
        totpSecret: config.adminTotpSecret,
      },
    }],
    ['authRiskStore', factories.createMongoAuthRiskStore, {
      uri: config.mongoUri,
      encryptionKey: config.authEncryptionKey,
      challengeConfigured: Boolean(config.turnstileSiteKey && config.turnstileSecretKey),
      windowMinutes: config.loginWindowMinutes,
      maxAttempts: config.loginMaxAttempts,
      challengeThreshold: config.loginChallengeThreshold,
      backoffBaseMs: config.loginBackoffBaseMs,
      backoffMaxMs: config.loginBackoffMaxMs,
    }],
    ['sessionRegistry', factories.createMongoSessionRegistry, {
      uri: config.mongoUri,
      secret: config.sessionSecret,
      idleTimeoutMinutes: config.sessionIdleMinutes,
    }],
    ['operationsStore', factories.createMongoOperationsStore, {
      uri: config.mongoUri,
      statusRetentionDays: config.statusRetentionDays,
      auditRetentionDays: config.auditRetentionDays,
    }],
    ['releaseStore', factories.createMongoReleaseStore, { uri: config.mongoUri }],
    ['configurationStore', factories.createMongoConfigurationStore, { uri: config.mongoUri }],
    ['qrLoginStore', factories.createMongoQrLoginStore, { uri: config.mongoUri }],
    ['webLoginTicketStore', factories.createMongoWebLoginTicketStore, { uri: config.mongoUri }],
    ['googleAccountStore', factories.createMongoGoogleAccountStore, { uri: config.mongoUri }],
    ['externalApplicationStore', factories.createMongoExternalApplicationStore, {
      uri: config.mongoUri,
      encryptionKey: config.authEncryptionKey,
    }],
  ];

  try {
    stores.mongoClient = clientFactory(config.mongoUri);
    await stores.mongoClient.connect();
    for (const [name, factory, options] of definitions) {
      if (typeof factory !== 'function') throw new TypeError(`Missing Mongo factory for ${name}.`);
      stores[name] = await factory({ ...options, client: stores.mongoClient });
    }
    return stores;
  } catch (error) {
    await closePortalStores(stores);
    throw error;
  }
}
