const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const endpoint = (origin, pathname) => new URL(pathname, origin).toString();

export function buildExternalAuthGuideContract({ origin, tokenTtlSeconds = 300 } = {}) {
  const issuer = new URL(origin || 'http://127.0.0.1').origin;
  return {
    schemaVersion: 2,
    title: 'MY 外部项目 OIDC 接入契约',
    documentationUrl: endpoint(issuer, '/docs/external-auth'),
    machineReadableUrl: endpoint(issuer, '/docs/external-auth.json'),
    issuer,
    endpoints: {
      discovery: endpoint(issuer, '/.well-known/openid-configuration'),
      authorization: endpoint(issuer, '/oauth/authorize'),
      token: endpoint(issuer, '/oauth/token'),
      userinfo: endpoint(issuer, '/oauth/userinfo'),
      jwks: endpoint(issuer, '/oauth/jwks.json'),
    },
    protocol: {
      flow: 'authorization_code',
      responseType: 'code',
      scopes: ['openid', 'profile', 'roles'],
      pkceRequired: true,
      pkceMethod: 'S256',
      clientAuthentication: ['client_secret_basic', 'client_secret_post'],
      idTokenSigningAlgorithm: 'EdDSA',
      authorizationCodeTtlSeconds: 60,
      tokenTtlSeconds,
      discovery: {
        method: 'GET',
        requiredAtRuntime: true,
        expectedStatus: 200,
        expectedContentType: 'application/json',
        failClosed: true,
      },
      authorizationRequest: {
        method: 'GET',
        requiredParameters: [
          'response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'nonce',
          'code_challenge', 'code_challenge_method',
        ],
        fixedValues: {
          response_type: 'code',
          code_challenge_method: 'S256',
        },
        example: {
          client_id: '<MY_CLIENT_ID>',
          redirect_uri: '<MY_REDIRECT_URI>',
          scope: 'openid profile roles',
          state: '<服务端生成并保存在会话中的随机值>',
          nonce: '<服务端生成并保存在会话中的随机值>',
          code_challenge: '<BASE64URL(SHA256(code_verifier))>',
        },
      },
      tokenRequest: {
        method: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        requiredParameters: ['grant_type', 'code', 'redirect_uri', 'code_verifier'],
        fixedValues: { grant_type: 'authorization_code' },
        clientAuthentication: ['client_secret_basic', 'client_secret_post'],
        clientSecretServerOnly: true,
      },
      tokenResponse: {
        requiredFields: ['access_token', 'id_token', 'token_type', 'expires_in', 'scope'],
        tokenType: 'Bearer',
      },
      userinfoRequest: {
        method: 'GET',
        authentication: 'Authorization: Bearer <access_token>',
        optionalForLogin: true,
      },
      idTokenValidation: {
        jwksSource: 'discovery.jwks_uri',
        requiredChecks: ['signature', 'alg=EdDSA', 'iss', 'aud', 'exp', 'iat', 'nonce', 'token_use=id'],
        refreshJwksOnceOnUnknownKid: true,
      },
    },
    claims: ['sub', 'preferred_username', 'role'],
    compatibility: {
      existingRegistrationChangeRequired: false,
      successfulLoginProtocolChanged: false,
      clientErrorHandlingUpgradeRecommended: true,
      upgradeWhen: [
        '客户端会自动重试同一个授权码',
        '客户端把所有 Token 非 200 响应统一映射为 500 或 502',
        '客户端会向浏览器或日志透出上游 error_description',
      ],
    },
    registration: {
      requiredFields: ['name', 'launchUrl', 'redirectUris'],
      optionalFields: ['description', 'healthUrl', 'requiredRole', 'openMode', 'enabled'],
      allowedRoles: ['viewer', 'operator', 'super_admin'],
      allowedOpenModes: ['webview', 'browser'],
      redirectUriPolicy: 'exact_match_no_wildcards',
      productionUrlPolicy: 'https_only_except_loopback_development',
    },
    credentials: {
      issued: ['client_id', 'client_secret'],
      clientSecretDisplayedOnce: true,
      clientSecretServerOnly: true,
      recommendedEnvironment: {
        MY_ISSUER: issuer,
        MY_CLIENT_ID: '<在控制台创建后复制>',
        MY_CLIENT_SECRET: '<创建或轮换后立即保存>',
        MY_REDIRECT_URI: '<与控制台逐字符一致的回调地址>',
      },
    },
    externalProjectRoutes: {
      start: 'GET /auth/my/start',
      callback: 'GET /auth/my/callback',
      logout: 'POST /auth/logout',
      health: 'GET /health',
    },
    session: {
      platformTokenPurpose: '仅用于建立外部项目自己的本地会话',
      localCookie: ['HttpOnly', 'Secure in production', 'SameSite=Lax'],
      regenerateSessionIdAfterLogin: true,
      singleLogoutSupported: false,
      logoutBehavior: '只销毁外部项目自己的会话，不会退出 MY 或其他项目。',
    },
    errorHandling: {
      callbackErrors: ['error', 'error_description', 'state'],
      restartLoginOn: [
        'invalid_request', 'invalid_grant', 'expired_or_replayed_code', 'state_mismatch',
        'temporarily_unavailable',
      ],
      neverRetryAuthorizationCode: true,
      neverExposeUpstreamErrorDescription: true,
      tokenEndpointErrors: {
        temporarily_unavailable: {
          action: 'restart_login_after_delay',
          honorRetryAfter: true,
          retryAuthorizationCode: false,
        },
        invalid_grant: {
          action: 'restart_login',
          retryAuthorizationCode: false,
        },
        invalid_client: {
          action: 'report_server_configuration_error',
          retryAuthorizationCode: false,
        },
      },
      commonErrors: {
        invalid_client: '检查 client_id 和 client_secret 是否来自同一次创建或轮换。',
        invalid_grant: '授权码可能过期、已消费，或 redirect_uri、code_verifier 不匹配；重新开始登录。',
        temporarily_unavailable: 'Token 请求过于频繁；遵循 Retry-After，等待后重新开始登录。',
        invalid_request: '检查必需授权参数、scope、nonce 和 PKCE S256。',
        access_denied: '账号角色不足或应用已停用。',
      },
    },
    securityRequirements: [
      'state、nonce、code_verifier 必须保存在外部项目服务端会话中。',
      '回调后立即删除 OAuth 临时状态，并重新生成外部项目 Session ID。',
      'ID Token 必须校验 iss、aud、exp、iat、nonce、token_use 和 EdDSA 签名。',
      'client_secret、授权码、Token、Cookie 和完整回调查询参数不得进入日志。',
      '外部项目必须自行执行业务权限校验，不能只依赖登录成功。',
    ],
    aiImplementationRequest: [
      '请按本契约为我的项目实现服务端 OIDC Authorization Code + PKCE 登录。',
      '运行时必须读取 /.well-known/openid-configuration 并校验 issuer，不要硬编码 authorization、token、userinfo 或 jwks 端点。',
      '开始登录时在服务端生成 state、nonce 和 43-128 字符 code_verifier，使用 S256 生成 code_challenge，并把临时值保存在服务端会话。',
      '授权请求必须包含 response_type、client_id、redirect_uri、scope、state、nonce、code_challenge 和 code_challenge_method。',
      '回调必须先处理 OAuth error，再校验并一次性删除 state，使用同一个 redirect_uri 和原始 code_verifier 从后端兑换 Token。',
      'Token 端点返回 invalid_grant 时重新开始登录；返回 temporarily_unavailable 时遵循 Retry-After 后重新开始；invalid_client 必须报告服务端配置错误。任何情况都不得重试同一个授权码或透出上游 error_description。',
      'ID Token 必须使用 Discovery 的 jwks_uri 验证 EdDSA 签名及 iss、aud、exp、iat、nonce、token_use=id；未知 kid 时只刷新一次 JWKS。',
      '把 MY_ISSUER、MY_CLIENT_ID、MY_CLIENT_SECRET、MY_REDIRECT_URI 做成服务端环境变量。',
      '不要把 client_secret 放入浏览器、前端代码、URL 或日志。',
      '登录成功后重新生成本地 Session ID，保存 sub、preferred_username、role，并在每个业务接口自行做权限校验。',
      '实现 /auth/my/start、/auth/my/callback、本地会话、角色映射、本地退出和健康检查；不要宣称支持跨项目统一退出。',
      '不得记录授权码、Token、client_secret、Cookie 或完整回调查询参数。',
    ],
    aiExpectedOutput: {
      registrationFields: ['name', 'launchUrl', 'redirectUris', 'healthUrl', 'requiredRole', 'openMode'],
      environmentVariables: ['MY_ISSUER', 'MY_CLIENT_ID', 'MY_CLIENT_SECRET', 'MY_REDIRECT_URI', 'SESSION_SECRET'],
      implementation: [
        'Discovery 客户端', 'PKCE 与临时状态', '登录入口', '回调与 Token 兑换',
        'ID Token 验签', '本地会话', '角色映射', '本地退出', '健康检查',
      ],
      verification: [
        'Discovery 返回 200 JSON 且 issuer 匹配', '登录跳转参数完整', 'state 和 nonce 不匹配时拒绝',
        '回调换取 Token', 'Token 错误分类与 Retry-After', 'ID Token 验签', '授权码不可重放',
        '角色映射', '退出', '健康检查',
      ],
    },
  };
}

export const EXTERNAL_AUTH_GUIDE_CSS = [
  ':root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172b48;background:#f4f7fa}',
  '*{box-sizing:border-box}body{margin:0;background:#f4f7fa}a{color:#1458b8}.guide-shell{min-height:100vh}',
  '.guide-header{border-bottom:1px solid #d8e0eb;background:#fff}.guide-header-inner,.guide-layout,.guide-footer{width:min(1180px,calc(100% - 40px));margin:0 auto}',
  '.guide-header-inner{display:flex;min-height:78px;align-items:center;justify-content:space-between;gap:24px}.guide-brand{display:flex;align-items:center;gap:12px;color:#102d70;text-decoration:none}',
  '.guide-brand-mark{display:grid;width:42px;height:42px;place-items:center;border-radius:8px;background:#eaf2ff;color:#1458b8;font-size:18px;font-weight:800}.guide-brand strong,.guide-brand small{display:block}.guide-brand small{margin-top:2px;color:#68778d;font-size:13px;font-weight:500}',
  '.guide-actions{display:flex;align-items:center;gap:12px;font-size:13px}.guide-actions a{text-decoration:none}.guide-button{display:inline-flex;min-height:38px;align-items:center;padding:0 13px;border:1px solid #cbd7e8;border-radius:7px;background:#fff;font-weight:700}',
  '.guide-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:42px;padding:34px 0 70px}.guide-toc{position:sticky;top:22px;align-self:start}.guide-toc strong{display:block;margin-bottom:10px;color:#68778d;font-size:12px}.guide-toc a{display:block;padding:7px 0;color:#4d617d;font-size:14px;text-decoration:none}',
  '.guide-content{min-width:0}.guide-kicker{margin:0 0 8px;color:#1458b8;font-size:13px;font-weight:800}.guide-content h1{margin:0;color:#102d70;font-size:40px;line-height:1.15}.guide-lead{max-width:780px;margin:12px 0 24px;color:#52657f;font-size:17px;line-height:1.7}',
  '.guide-notice{margin:22px 0 34px;padding:14px 16px;border-left:3px solid #1458b8;background:#eaf2ff;color:#274b7c;line-height:1.65}.guide-section{margin-top:40px;scroll-margin-top:22px}.guide-section h2{margin:0 0 12px;color:#102d70;font-size:23px}.guide-section h3{margin:22px 0 8px;font-size:17px}.guide-section p,.guide-section li{color:#52657f;line-height:1.75}',
  '.guide-table-wrap{overflow-x:auto;border:1px solid #d8e0eb;border-radius:8px;background:#fff}.guide-table{width:100%;min-width:650px;border-collapse:collapse}.guide-table th,.guide-table td{padding:12px 14px;border-bottom:1px solid #e5eaf1;text-align:left;vertical-align:top;line-height:1.55}.guide-table tr:last-child td{border-bottom:0}.guide-table th{background:#f7f9fc;color:#52657f;font-size:12px}.guide-table td{color:#334a68;font-size:14px}',
  'code{padding:2px 5px;border-radius:4px;background:#edf2f8;color:#174a8c;font-family:"SFMono-Regular",Consolas,monospace;font-size:.9em}.guide-code{overflow-x:auto;margin:12px 0 0;padding:16px;border-radius:8px;background:#172b48;color:#edf4ff;font:13px/1.7 "SFMono-Regular",Consolas,monospace;white-space:pre-wrap}.guide-endpoint{overflow-wrap:anywhere;color:#174a8c;font-family:"SFMono-Regular",Consolas,monospace;font-size:13px}',
  '.guide-footer{padding:18px 0 30px;border-top:1px solid #d8e0eb;color:#68778d;font-size:13px}',
  '@media(max-width:820px){.guide-header-inner,.guide-layout,.guide-footer{width:min(100% - 24px,680px)}.guide-header-inner{align-items:flex-start;flex-direction:column;padding:16px 0;gap:14px}.guide-layout{display:block;padding-top:22px}.guide-content h1{font-size:30px}.guide-toc{position:static;display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:28px}.guide-toc strong{width:100%}.guide-toc a{padding:3px 0}}',
].join('');

export function renderExternalAuthGuideHtml({ origin, tokenTtlSeconds = 300 } = {}) {
  const contract = buildExternalAuthGuideContract({ origin, tokenTtlSeconds });
  const safeOrigin = escapeHtml(contract.issuer);
  const endpointDescriptions = {
    discovery: ['GET', '公开 OIDC 元数据；外部项目运行时必须先读取。'],
    authorization: ['GET', '浏览器授权入口。'],
    token: ['POST', '外部项目后端用授权码和 PKCE verifier 兑换 Token。'],
    userinfo: ['GET', '使用 Bearer Access Token 获取当前用户声明；登录流程可选。'],
    jwks: ['GET', '公开 Ed25519 验签公钥，可缓存并按 kid 选择。'],
  };
  const endpointRows = Object.entries(contract.endpoints)
    .map(([name, value]) => '<tr><td><code>' + escapeHtml(name) + '</code></td><td><code>' + endpointDescriptions[name][0] + '</code></td><td><span class="guide-endpoint">' + escapeHtml(value) + '</span></td><td>' + endpointDescriptions[name][1] + '</td></tr>')
    .join('');
  const environment = [
    'MY_ISSUER=' + contract.issuer,
    'MY_CLIENT_ID=控制台创建后复制的 client_id',
    'MY_CLIENT_SECRET=控制台创建或轮换后立即保存的 client_secret',
    'MY_REDIRECT_URI=https://project.example.com/auth/my/callback',
    'SESSION_SECRET=外部项目自己生成的独立随机值',
  ].join('\n');
  const authorizationParameters = [
    'response_type=code',
    'client_id=<MY_CLIENT_ID>',
    'redirect_uri=<MY_REDIRECT_URI，必须与控制台逐字符一致>',
    'scope=openid profile roles',
    'state=<外部项目服务端随机值>',
    'nonce=<外部项目服务端随机值>',
    'code_challenge=<BASE64URL(SHA256(code_verifier))>',
    'code_challenge_method=S256',
  ].join('\n');
  const tokenRequest = [
    'POST <Discovery 返回的 token_endpoint>',
    'Content-Type: application/x-www-form-urlencoded',
    'Authorization: Basic BASE64(<client_id>:<client_secret>)',
    '',
    'grant_type=authorization_code',
    'code=<回调收到的一次性授权码>',
    'redirect_uri=<与授权请求完全相同的 MY_REDIRECT_URI>',
    'code_verifier=<登录开始时保存在服务端会话中的原始值>',
    '',
    '# 也可不使用 Authorization 头，改在表单中提交 client_id 和 client_secret。',
    '# 两种方式都只能由外部项目后端执行。',
  ].join('\n');
  const tokenResponse = JSON.stringify({
    access_token: '<Bearer Access Token>',
    id_token: '<EdDSA 签名的 ID Token>',
    token_type: 'Bearer',
    expires_in: tokenTtlSeconds,
    scope: 'openid profile roles',
  }, null, 2);
  const userinfoRequest = [
    'GET <Discovery 返回的 userinfo_endpoint>',
    'Authorization: Bearer <access_token>',
    '',
    '# 返回：sub、preferred_username、role',
  ].join('\n');
  const aiPrompt = [
    '请按 MY 外部项目 OIDC 接入契约，为我的项目实现服务端 Authorization Code + PKCE 登录。',
    '文档：' + contract.documentationUrl,
    '机器可读契约：' + contract.machineReadableUrl,
    'Issuer：' + contract.issuer,
    '运行时先读取 ' + contract.endpoints.discovery + '；若不是 200 JSON 或 issuer 不匹配，必须停止登录并报告配置错误，不要静默回退或硬编码端点。',
    '开始登录时在服务端生成并保存 state、nonce、43-128 字符 code_verifier 和受控站内 returnTo，使用 S256 计算 code_challenge。',
    '授权请求完整携带 response_type=code、client_id、精确 redirect_uri、scope=openid profile roles、state、nonce、code_challenge、code_challenge_method=S256。',
    '回调先处理 error/error_description，再校验并一次性删除 state；后端使用同一个 redirect_uri、原始 code_verifier 和客户端凭据兑换 Token。',
    'Token 端点返回 invalid_grant 时提示授权已失效并重新开始登录；返回 temporarily_unavailable 时遵循 Retry-After 后重新开始；invalid_client 作为服务端客户端配置错误处理。不得自动重试同一个授权码，也不得向客户端或日志透出上游 error_description。',
    '从 Discovery 的 jwks_uri 读取公钥，验证 ID Token 的 EdDSA 签名、kid、iss、aud、exp、iat、nonce 和 token_use=id；未知 kid 时最多刷新一次 JWKS。',
    '登录成功后重新生成本地 Session ID，只保存所需的 sub、preferred_username、role，并为业务接口实现默认拒绝的角色授权。',
    '实现 /auth/my/start、/auth/my/callback、本地会话、POST /auth/logout 和快速无认证 GET /health。退出只销毁本项目会话。',
    '把 MY_ISSUER、MY_CLIENT_ID、MY_CLIENT_SECRET、MY_REDIRECT_URI 做成服务端环境变量。',
    'client_secret、授权码、Token、Cookie 和完整回调查询参数不得进入前端、URL 或日志。',
    '请先检查现有登录代码和反向代理配置，再给出最小改动、迁移步骤和验证命令。',
    '请增加针对 Discovery、跳转参数、state/nonce 失败、Token 兑换、Token 错误分类与 Retry-After、ID Token 验签、授权码重放、角色映射、退出和健康检查的测试。',
    '完成后明确给出控制台要填写的应用名称、启动地址、精确回调地址、健康检查地址、最低角色、Android 打开方式，以及需要配置的环境变量名；不得输出真实 Secret。',
  ].join('\n');
  const contractJson = escapeHtml(JSON.stringify(contract, null, 2));

  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="description" content="MY 外部项目 OIDC 接入文档，公开访问，无需登录。"><title>MY 外部项目接入文档</title><link rel="stylesheet" href="/docs/external-auth.css"></head><body>',
    '<div class="guide-shell"><header class="guide-header"><div class="guide-header-inner"><a class="guide-brand" href="/docs/external-auth"><span class="guide-brand-mark">MY</span><span><strong>外部项目接入文档</strong><small>统一身份认证 · OIDC · Android 一键进入</small></span></a>',
    '<div class="guide-actions"><a class="guide-button" href="/docs/external-auth.json">JSON 契约</a><a href="/console">返回控制台</a></div></div></header>',
    '<div class="guide-layout"><nav class="guide-toc" aria-label="文档目录"><strong>目录</strong><a href="#quick-start">快速开始</a><a href="#endpoints">平台端点</a><a href="#registration">控制台填什么</a><a href="#implementation">外部项目怎么改</a><a href="#security">安全要求</a><a href="#ai">交给 AI</a></nav>',
    '<main class="guide-content"><p class="guide-kicker">PUBLIC INTEGRATION GUIDE</p><h1>让独立项目接入 MY 统一登录</h1><p class="guide-lead">本页无需登录。你可以把本页 URL 或 JSON 契约直接交给 AI，让 AI 按真实端点和字段实现接入。MY 使用标准 OIDC Authorization Code + PKCE，外部项目只需要在自己的后端增加登录回调和本地会话。</p>',
    '<div class="guide-notice"><strong>当前 Issuer：</strong> <span class="guide-endpoint">' + safeOrigin + '</span><br>客户端 Secret 只在控制台创建或轮换后显示一次，本页和 JSON 契约不会公开它。</div>',
    '<section class="guide-section" id="quick-start"><h2>快速开始</h2><ol><li>准备外部项目的启动地址和精确回调地址。</li><li>登录控制台进入“服务目录 → 外部应用”，点击“接入应用”。</li><li>创建成功后立即保存 <code>client_id</code> 和 <code>client_secret</code>。</li><li>把本页和 JSON 契约交给 AI，要求它只在外部项目后端实现 OIDC。</li></ol><p><strong>既有接入项目无需重新注册。</strong>现有 <code>client_id</code>、Secret、启动地址和回调地址继续有效，成功登录协议也未改变；但旧客户端若会重试同一个授权码、统一吞掉 Token 错误或透出上游错误描述，应按本页“安全与失败处理”升级。</p></section>',
    '<section class="guide-section" id="endpoints"><h2>平台端点</h2><p>外部项目运行时必须先读取 Discovery，并确认响应为 <code>200 application/json</code> 且 <code>issuer</code> 与配置一致。失败时停止登录并报告配置错误，不要自行拼接、硬编码或静默回退端点。</p><div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>名称</th><th>方法</th><th>地址</th><th>用途</th></tr></thead><tbody>' + endpointRows + '</tbody></table></div></section>',
    '<section class="guide-section" id="registration"><h2>控制台填什么</h2><div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>字段</th><th>应该填写什么</th><th>示例</th></tr></thead><tbody>',
    '<tr><td><code>应用名称</code></td><td>项目在控制台和 Android 中显示的名称。</td><td>我的项目</td></tr>',
    '<tr><td><code>启动地址</code></td><td>外部项目后端生成 state、nonce、PKCE 后跳转到 MY 的入口，生产环境必须 HTTPS。</td><td>https://project.example.com/auth/my/start</td></tr>',
    '<tr><td><code>回调地址</code></td><td>接收授权码的后端地址，每行一个，必须和 <code>redirect_uri</code> 逐字符一致，不支持通配符。</td><td>https://project.example.com/auth/my/callback</td></tr>',
    '<tr><td><code>健康检查地址</code></td><td>可选的无认证快速 GET 地址，只返回 2xx 和非敏感内容。</td><td>https://project.example.com/health</td></tr>',
    '<tr><td><code>最低访问角色</code></td><td><code>viewer</code> 所有账号，<code>operator</code> 操作员及以上，<code>super_admin</code> 仅超级管理员。</td><td>viewer</td></tr>',
    '<tr><td><code>Android 打开方式</code></td><td><code>webview</code> 在 App 内打开，<code>browser</code> 使用系统浏览器。</td><td>webview</td></tr>',
    '<tr><td><code>允许访问</code></td><td>停用后拒绝新的授权和 Token 兑换。</td><td>开启</td></tr></tbody></table></div></section>',
    '<section class="guide-section" id="implementation"><h2>外部项目怎么改</h2><h3>服务端环境变量</h3><pre class="guide-code">' + escapeHtml(environment) + '</pre>',
    '<h3>必须实现的路由</h3><div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>路由</th><th>职责</th></tr></thead><tbody><tr><td><code>GET /auth/my/start</code></td><td>生成并保存 state、nonce、code_verifier，读取 Discovery 后跳转授权端点。</td></tr><tr><td><code>GET /auth/my/callback</code></td><td>校验 state，服务端兑换 Token，验签 ID Token，创建本地会话。</td></tr><tr><td><code>GET /health</code></td><td>快速无认证健康检查，不暴露数据库、Token 或环境变量。</td></tr><tr><td><code>POST /auth/logout</code></td><td>销毁外部项目自己的会话。</td></tr></tbody></table></div>',
    '<h3>1. 发起授权</h3><p><code>state</code>、<code>nonce</code> 和原始 <code>code_verifier</code> 必须由后端生成并保存在服务端会话中。将下列参数编码到 Discovery 返回的 <code>authorization_endpoint</code>：</p><pre class="guide-code">' + escapeHtml(authorizationParameters) + '</pre>',
    '<h3>2. 回调与 Token 兑换</h3><p>回调先处理 <code>error</code>，再校验 <code>state</code>，并立即删除本次临时状态。Token 兑换只能从外部项目后端发起：</p><pre class="guide-code">' + escapeHtml(tokenRequest) + '</pre>',
    '<h3>3. Token 响应</h3><pre class="guide-code">' + escapeHtml(tokenResponse) + '</pre><p>不要仅仅解码 ID Token。必须使用 Discovery 的 <code>jwks_uri</code> 验证签名，并检查 <code>alg=EdDSA</code>、<code>iss</code>、<code>aud</code>、<code>exp</code>、<code>iat</code>、<code>nonce</code> 和 <code>token_use=id</code>。</p>',
    '<h3>4. 可选 UserInfo</h3><pre class="guide-code">' + escapeHtml(userinfoRequest) + '</pre></section>',
    '<section class="guide-section" id="security"><h2>安全与失败处理</h2><ul><li>必须使用 Authorization Code + PKCE，禁止把 Secret 放进浏览器。</li><li>回调后立即删除 OAuth 临时状态，并重新生成本地 Session ID。</li><li>ID Token 必须检查 <code>iss</code>、<code>aud</code>、<code>exp</code>、<code>iat</code>、<code>nonce</code>、<code>token_use=id</code> 和 EdDSA 签名；遇到未知 <code>kid</code> 时刷新一次 JWKS，仍找不到就拒绝登录。</li><li>外部项目必须自行执行角色和业务权限判断，未知角色默认拒绝。</li><li>生产 Cookie 使用 HttpOnly、Secure、SameSite=Lax；多实例使用共享 Session Store。</li><li>不得记录授权码、Token、client_secret、Cookie、上游 <code>error_description</code> 或完整回调查询参数。</li><li><code>invalid_grant</code>、state/nonce 不匹配、授权码过期或重放时必须重新开始登录，不得重试同一个授权码。</li><li><code>temporarily_unavailable</code> 时遵循受信任的 <code>Retry-After</code>，等待后重新开始登录；<code>invalid_client</code> 应报告服务端客户端配置错误。</li><li>当前不支持跨项目统一退出；<code>POST /auth/logout</code> 只销毁外部项目自己的会话。</li></ul></section>',
    '<section class="guide-section" id="ai"><h2>交给 AI 的任务模板</h2><p>把下面文字和 JSON 契约一起发给 AI，再补充你的项目技术栈：</p><pre class="guide-code">' + escapeHtml(aiPrompt) + '</pre><p>机器可读契约：<a href="/docs/external-auth.json"><code>' + escapeHtml(contract.machineReadableUrl) + '</code></a></p><details><summary>展开完整 JSON 契约</summary><pre class="guide-code">' + contractJson + '</pre></details></section>',
    '</main></div><footer class="guide-footer">MY 外部项目接入文档 · 公开页面不包含任何应用 Secret 或内部密钥。</footer></div></body></html>',
  ].join('');
}
