function registerAuthRoutes(app, { authManager, loginLimiter }) {
  app.get('/api/auth/status', (req, res) => {
    const authState = authManager.getRequestAuth(req);

    res.json({
      enabled: authState.enabled,
      authenticated: authState.authenticated,
      username: authState.username
    });
  });

  app.post('/api/auth/login', loginLimiter, (req, res) => {
    const username = String(req.body.username || '');
    const password = String(req.body.password || '');
    const result = authManager.authenticate(username, password);

    if (result.disabled) {
      return res.json({
        message: '当前未启用登录鉴权。',
        enabled: false
      });
    }

    if (!result.ok) {
      return res.status(401).json({
        error: result.message
      });
    }

    authManager.applySessionCookie(res, result.session, {
      secure: authManager.isSecureRequest(req)
    });

    return res.json({
      message: '登录成功。',
      enabled: true
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    authManager.clearSession(res);
    res.json({
      message: '已退出登录。'
    });
  });
}

module.exports = {
  registerAuthRoutes
};
