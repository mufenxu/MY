const { normalizeApiKeyScopes } = require('../../storage/db');

function registerKeyRoutes(app, { mqttService, requireSession }) {
  app.get('/api/keys', requireSession, async (req, res, next) => {
    try {
      const keys = await mqttService.db.getApiKeys();
      res.json(keys);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/keys', requireSession, async (req, res, next) => {
    const { name, scopes } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: '必须提供有效的密钥名称 (name)。' });
    }

    try {
      const key = await mqttService.db.addApiKey(name.trim(), normalizeApiKeyScopes(scopes));
      res.status(201).json({
        message: '密钥创建成功。请立即保存完整令牌，后续不会再次显示。',
        key
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/keys/:keyId', requireSession, async (req, res, next) => {
    const { keyId } = req.params;
    try {
      await mqttService.db.deleteApiKey(keyId);
      res.json({ message: '密钥已成功吊销。' });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  registerKeyRoutes
};
