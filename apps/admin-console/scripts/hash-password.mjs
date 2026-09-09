import { createPasswordHash } from '../src/auth.js';

const password = process.argv[2];
if (password === '--recover') {
  let client;
  try {
    if (!process.stdin.isTTY || !process.stdout.isTTY || !process.argv[3]) {
      throw new Error('RECOVERY_REQUIRES_TERMINAL');
    }
    const [{ MongoClient }, { loadConfig }, { createMongoAuthStore }, { createMongoOperationsStore }] = await Promise.all([
      import('mongodb'), import('../src/config.js'), import('../src/auth-store.js'), import('../src/operations-store.js'),
    ]);
    const config = loadConfig();
    if (!config.mongoUri) throw new Error('MONGODB_REQUIRED');
    client = new MongoClient(config.mongoUri, { maxPoolSize: 2, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const accounts = await createMongoAuthStore({
      client, encryptionKey: config.authEncryptionKey, issuer: config.webauthnRpName,
      legacyBindings: config.legacyServiceBindings,
      bootstrap: { username: config.adminUsername, passwordHash: config.adminPasswordHash, role: config.adminRole, totpSecret: config.adminTotpSecret },
    });
    const account = await accounts.findAccount(process.argv[3]);
    if (!account?.active) throw new Error('ACCOUNT_NOT_FOUND');
    const audit = await createMongoOperationsStore({ client });
    const recoveryToken = await accounts.saveChallenge({
      kind: 'account_recovery', username: account.username, ttlMs: 10 * 60_000,
      challenge: { accountId: account.id, authVersion: account.authVersion || 0 },
    });
    await audit.addAudit({ actor: 'local-operator', action: 'security.account_recovery_issued', targetType: 'account', targetId: account.username, details: { method: 'local-command' } });
    const link = new URL('/console', config.publicOrigin);
    link.hash = new URLSearchParams({ recover: recoveryToken }).toString();
    process.stdout.write(`一次性恢复链接（十分钟有效，请妥善保管）：\n${link.href}\n`);
  } catch {
    console.error('恢复凭据签发失败。请在可信的交互终端运行 --recover <账号>，并检查平台数据库、加密配置和账号启用状态。');
    process.exitCode = 1;
  } finally {
    await client?.close();
  }
} else if (!password) {
  console.error('用法：npm run password -- "你的管理员密码"；本机恢复：npm run password -- --recover <账号>');
  process.exitCode = 1;
} else {
  console.log(await createPasswordHash(password));
}
