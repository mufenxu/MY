const STORE_NAMES = [
  'authStore',
  'authRiskStore',
  'sessionRegistry',
  'operationsStore',
  'releaseStore',
  'configurationStore',
];

export async function closePortalStores(stores = {}) {
  const results = await Promise.allSettled(
    STORE_NAMES
      .filter((name) => typeof stores[name]?.close === 'function')
      .map((name) => Promise.resolve().then(() => stores[name].close())),
  );
  return results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
}

export async function pingPortalStores(stores = {}) {
  const results = await Promise.all(
    STORE_NAMES
      .filter((name) => typeof stores[name]?.ping === 'function')
      .map((name) => Promise.resolve().then(() => stores[name].ping())),
  );
  return results.every(Boolean);
}

export async function createPersistentPortalStores({ config, factories } = {}) {
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
  ];

  try {
    for (const [name, factory, options] of definitions) {
      if (typeof factory !== 'function') throw new TypeError(`Missing Mongo factory for ${name}.`);
      stores[name] = await factory(options);
    }
    return stores;
  } catch (error) {
    await closePortalStores(stores);
    throw error;
  }
}
