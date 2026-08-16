import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Turnstile } from '@marsidev/react-turnstile';
import { requestJson } from './api.js';
import { PLATFORM_BRAND_ICON } from './brand.js';

export function QrLoginPanel({ request, busy, error, remainingSeconds, onRefresh }) {
  const scanned = request?.status === 'scanned';
  return (
    <div className="qr-login-flow" aria-live="polite">
      {busy && !request ? (
        <div className="qr-login-loading">
          <LoaderCircle className="spin" size={24} />
          <span>正在创建安全二维码...</span>
        </div>
      ) : request ? (
        <>
          {scanned ? (
            <div className="qr-login-scanned">
              <span><Smartphone size={30} /></span>
              <strong>已扫码，等待 App 确认</strong>
              <p>请核对 App 中的浏览器与验证码</p>
            </div>
          ) : (
            <div className="qr-login-code">
              <img src={request.qrDataUrl} alt="MY Control 扫码登录二维码" />
              <span className="qr-login-expiry">{remainingSeconds > 0 ? `${remainingSeconds} 秒后失效` : '二维码已失效'}</span>
            </div>
          )}
          <div className="qr-verification-code">
            <span>安全验证码</span>
            <strong>{request.verificationCode}</strong>
          </div>
          <p className="qr-login-status">
            {scanned ? '确认后此页面将自动登录' : '使用 MY Control 扫码并确认本次登录'}
          </p>
        </>
      ) : null}
      {error && (
        <div className="form-error" role="alert">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {(!request || remainingSeconds <= 0 || error) && !busy && (
        <button className="secondary-action login-passkey-button" type="button" onClick={onRefresh}>
          <RefreshCw size={17} />
          刷新二维码
        </button>
      )}
    </div>
  );
}

export function LoginScreen({ onAuthenticated, totpRequired = false }) {
  const [loginMode, setLoginMode] = useState('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totp, setTotp] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [secondFactorRequired, setSecondFactorRequired] = useState(totpRequired);
  const [challenge, setChallenge] = useState(null);
  const [challengeToken, setChallengeToken] = useState('');
  const [mfaEnrollment, setMfaEnrollment] = useState(null);
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [pendingSession, setPendingSession] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [qrLogin, setQrLogin] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrRefreshKey, setQrRefreshKey] = useState(0);
  const [qrNow, setQrNow] = useState(Date.now());
  const turnstileRef = useRef(null);

  useEffect(() => {
    if (loginMode !== 'qr' || secondFactorRequired) return undefined;
    const controller = new AbortController();
    let pollTimer = 0;
    let active = true;

    async function poll(requestId) {
      try {
        const current = await requestJson(`/api/auth/qr/requests/${requestId}`, { signal: controller.signal });
        if (!active) return;
        setQrLogin((previous) => ({ ...previous, ...current }));
        if (current.status === 'approved') {
          setQrBusy(true);
          const session = await requestJson(`/api/auth/qr/requests/${requestId}/consume`, {
            method: 'POST',
            body: '{}',
            signal: controller.signal,
          });
          if (active) onAuthenticated(session);
          return;
        }
        if (current.status === 'rejected') {
          setQrError('本次登录已在 App 中拒绝。');
          return;
        }
        pollTimer = window.setTimeout(() => poll(requestId), 1500);
      } catch (pollError) {
        if (!active || pollError.code === 'REQUEST_ABORTED') return;
        setQrError(pollError.code === 'QR_LOGIN_EXPIRED' ? '二维码已过期，请刷新后重试。' : pollError.message);
      } finally {
        if (active) setQrBusy(false);
      }
    }

    async function createRequest() {
      setQrBusy(true);
      setQrError('');
      setQrLogin(null);
      try {
        const created = await requestJson('/api/auth/qr/requests', {
          method: 'POST',
          body: '{}',
          signal: controller.signal,
        });
        if (!active) return;
        setQrLogin(created);
        setQrNow(Date.now());
        pollTimer = window.setTimeout(() => poll(created.requestId), 900);
      } catch (createError) {
        if (active && createError.code !== 'REQUEST_ABORTED') setQrError(createError.message);
      } finally {
        if (active) setQrBusy(false);
      }
    }

    createRequest();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(pollTimer);
    };
  }, [loginMode, onAuthenticated, qrRefreshKey, secondFactorRequired]);

  useEffect(() => {
    if (!qrLogin?.expiresAt || loginMode !== 'qr') return undefined;
    const timer = window.setInterval(() => setQrNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [loginMode, qrLogin?.expiresAt]);

  const qrRemainingSeconds = qrLogin?.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(qrLogin.expiresAt) - qrNow) / 1000))
    : 0;

  useEffect(() => {
    const canvas = document.getElementById('login-bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let particles = createParticles();
    let animId = 0;

    function createParticles() {
      const count = window.innerWidth < 768 ? 20 : 35;
      return Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.8 + 0.9,
        alpha: Math.random() * 0.45 + 0.25,
      }));
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      particles = createParticles();
      if (motionQuery.matches) render(false);
    };
    window.addEventListener('resize', handleResize, { passive: true });

    const render = (moveParticles = true) => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (moveParticles) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(217, 119, 36, ${p.alpha})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 115) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(217, 119, 36, ${0.14 * (1 - dist / 115)})`;
            ctx.lineWidth = 0.65;
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      render();
      animId = requestAnimationFrame(animate);
    };

    const syncAnimation = () => {
      cancelAnimationFrame(animId);
      animId = 0;
      if (document.hidden || motionQuery.matches) {
        render(false);
        return;
      }
      animate();
    };

    document.addEventListener('visibilitychange', syncAnimation);
    motionQuery.addEventListener('change', syncAnimation);
    syncAnimation();

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', syncAnimation);
      motionQuery.removeEventListener('change', syncAnimation);
      cancelAnimationFrame(animId);
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const session = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, totp, recoveryCode, challengeToken, enrollmentCode }),
      });
      if (session.recoveryCodes?.length) {
        setPendingSession(session);
        setRecoveryCodes(session.recoveryCodes);
        setMfaEnrollment(null);
        return;
      }
      onAuthenticated(session);
    } catch (loginError) {
      if (loginError.code === 'MFA_ENROLLMENT_REQUIRED' && loginError.details?.enrollment) {
        setMfaEnrollment(loginError.details.enrollment);
        setEnrollmentCode('');
        setError('');
        return;
      }
      if (loginError.code === 'SECOND_FACTOR_REQUIRED') {
        setSecondFactorRequired(true);
        setError('');
        return;
      }
      if (loginError.code === 'BOT_CHALLENGE_REQUIRED' || loginError.details?.challengeRequired) {
        setChallenge({ siteKey: loginError.details?.turnstileSiteKey, nonce: Date.now() });
        setChallengeToken('');
      } else if (challenge?.siteKey) {
        turnstileRef.current?.reset?.();
        setChallengeToken('');
      }
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasskeyLogin() {
    if (!username.trim()) {
      setError('请先输入管理员账号。');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const generated = await requestJson('/api/auth/passkey/options', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), challengeToken }),
      });
      const response = await startAuthentication({ optionsJSON: generated.options });
      const session = await requestJson('/api/auth/passkey/verify', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), challengeId: generated.challengeId, response }),
      });
      onAuthenticated(session);
    } catch (passkeyError) {
      if (passkeyError.code === 'BOT_CHALLENGE_REQUIRED' || passkeyError.details?.challengeRequired) {
        setChallenge({ siteKey: passkeyError.details?.turnstileSiteKey, nonce: Date.now() });
        setChallengeToken('');
      }
      setError(passkeyError.name === 'NotAllowedError' ? 'Passkey 验证已取消。' : passkeyError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetStep() {
    setSecondFactorRequired(false);
    setTotp('');
    setRecoveryCode('');
    setError('');
  }

  return (
    <main className="login-page">
      <canvas id="login-bg-canvas" className="login-bg-canvas" />

      <a href="/" className="login-back-btn">
        <ArrowLeft size={16} />
        <span>返回品牌官网</span>
      </a>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <img src={PLATFORM_BRAND_ICON} alt="" />
          </span>
          <span>
            <strong>MY PLATFORM</strong>
            <small>统一服务控制台 · UNIFIED CONSOLE</small>
          </span>
        </div>

        <div className="login-heading">
          <span className="login-icon">
            {secondFactorRequired ? <KeyRound size={22} /> : loginMode === 'qr' ? <QrCode size={22} /> : <LockKeyhole size={22} />}
          </span>
          <div>
            <h1 id="login-title">
              {secondFactorRequired ? '安全二次验证' : loginMode === 'qr' ? 'App 扫码登录' : '管理员身份验证'}
            </h1>
            <p>
              {secondFactorRequired
                ? '为了确保您的账户安全，请输入 6 位动态验证码'
                : loginMode === 'qr' ? '由已登录的 MY Control 安全确认' : '登录后掌控平台运维、身份与灾备系统'}
            </p>
          </div>
        </div>

        {!secondFactorRequired && recoveryCodes.length === 0 && (
          <div className="login-method-tabs" role="tablist" aria-label="登录方式">
            <button
              type="button"
              role="tab"
              aria-selected={loginMode === 'credentials'}
              className={loginMode === 'credentials' ? 'active' : ''}
              onClick={() => { setLoginMode('credentials'); setError(''); }}
            >
              <LockKeyhole size={16} />
              账号登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginMode === 'qr'}
              className={loginMode === 'qr' ? 'active' : ''}
              onClick={() => { setLoginMode('qr'); setError(''); }}
            >
              <QrCode size={16} />
              App 扫码
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {loginMode === 'qr' && !secondFactorRequired && recoveryCodes.length === 0 ? (
            <QrLoginPanel
              request={qrLogin}
              busy={qrBusy}
              error={qrError}
              remainingSeconds={qrRemainingSeconds}
              onRefresh={() => setQrRefreshKey((value) => value + 1)}
            />
          ) : recoveryCodes.length > 0 ? (
            <div className="login-recovery-codes">
              <div>
                <CheckCircle2 size={20} />
                <strong>多因素验证已成功启用</strong>
              </div>
              <p>请将以下一次性恢复码妥善保存在安全的地方。关闭此窗口后将不再显示。</p>
              <div className="codes-grid">
                {recoveryCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <button
                className="primary-button login-button"
                type="button"
                onClick={() => onAuthenticated(pendingSession)}
              >
                <ShieldCheck size={18} />
                我已保存，进入控制台
              </button>
            </div>
          ) : (
            <>
              {/* 二步验证模式：核验通过提示与返回按钮 */}
              {secondFactorRequired && (
                <div className="verified-account-badge">
                  <div className="badge-info">
                    <User size={15} />
                    <span>已核验账号: <strong>{username}</strong></span>
                  </div>
                  <button
                    type="button"
                    className="change-account-btn"
                    onClick={handleResetStep}
                    title="重新输入账号和密码"
                  >
                    切换账号
                  </button>
                </div>
              )}

              {/* 第一步：仅在未开启 2FA 时显示账号和密码 */}
              {!secondFactorRequired && (
                <>
                  <label className="input-group">
                    <span>管理员账号</span>
                    <div className="input-wrapper">
                      <User size={18} className="input-icon" />
                      <input
                        autoComplete="username webauthn"
                        value={username}
                        onChange={(event) => {
                          setUsername(event.target.value);
                          setMfaEnrollment(null);
                          setEnrollmentCode('');
                        }}
                        placeholder="请输入管理员账号"
                        required
                        autoFocus
                      />
                    </div>
                  </label>

                  <label className="input-group">
                    <span>密码</span>
                    <div className="input-wrapper">
                      <LockKeyhole size={18} className="input-icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="请输入密码"
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                </>
              )}

              {/* 第二步：只在需要 2FA 时显示动态验证码或恢复码 */}
              {secondFactorRequired && !useRecoveryCode && (
                <label className="input-group">
                  <span>动态验证码 (2FA)</span>
                  <div className="input-wrapper">
                    <KeyRound size={18} className="input-icon" />
                    <input
                      className="totp-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totp}
                      onChange={(event) => setTotp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="· · · · · ·"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      autoFocus
                    />
                  </div>
                </label>
              )}

              {secondFactorRequired && useRecoveryCode && (
                <label className="input-group">
                  <span>一次性恢复码</span>
                  <div className="input-wrapper">
                    <ShieldAlert size={18} className="input-icon" />
                    <input
                      autoComplete="one-time-code"
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value.toUpperCase().slice(0, 32))}
                      placeholder="输入 32 位恢复码"
                      required
                      autoFocus
                    />
                  </div>
                </label>
              )}

              {/* MFA 初始绑定提示 */}
              {mfaEnrollment && (
                <div className="login-mfa-enrollment">
                  <div className="qr-container">
                    <img src={mfaEnrollment.qrDataUrl} alt="动态验证二维码" />
                    <p className="qr-tip">使用身份验证器 APP 扫描二维码</p>
                    <code className="secret-code">{mfaEnrollment.secret}</code>
                  </div>
                  <label className="input-group">
                    <span>输入验证器生成的六位验证码</span>
                    <div className="input-wrapper">
                      <KeyRound size={18} className="input-icon" />
                      <input
                        className="totp-input"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={enrollmentCode}
                        onChange={(event) => setEnrollmentCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="六位验证码"
                        pattern="\d{6}"
                        maxLength={6}
                        required
                        autoFocus
                      />
                    </div>
                  </label>
                </div>
              )}

              {error && (
                <div className="form-error" role="alert">
                  <ShieldAlert size={16} />
                  <span>{error}</span>
                </div>
              )}

              {secondFactorRequired && (
                <button
                  className="login-mode-link"
                  type="button"
                  onClick={() => setUseRecoveryCode((value) => !value)}
                >
                  {useRecoveryCode ? '← 使用动态验证码登录' : '无法接收验证码？使用恢复码'}
                </button>
              )}

              {challenge?.siteKey && (
                <div className="login-challenge">
                  <Turnstile
                    key={challenge.nonce}
                    ref={turnstileRef}
                    siteKey={challenge.siteKey}
                    options={{ action: 'platform_login', theme: 'light' }}
                    onSuccess={setChallengeToken}
                    onExpire={() => setChallengeToken('')}
                    onError={() => setChallengeToken('')}
                  />
                </div>
              )}

              <button
                className="primary-button login-button glowing-btn"
                disabled={
                  submitting ||
                  (Boolean(challenge?.siteKey) && !challengeToken) ||
                  (Boolean(mfaEnrollment) && enrollmentCode.length !== 6) ||
                  (secondFactorRequired && !useRecoveryCode && totp.length !== 6)
                }
                type="submit"
              >
                {submitting ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}
                {submitting
                  ? '正在安全验证...'
                  : mfaEnrollment
                  ? '完成安全设置并登录'
                  : secondFactorRequired
                  ? '验证并登录'
                  : '立即登录'}
              </button>

              {!secondFactorRequired && (
                <button
                  className="secondary-action login-passkey-button"
                  disabled={submitting || !username.trim() || (Boolean(challenge?.siteKey) && !challengeToken)}
                  type="button"
                  onClick={handlePasskeyLogin}
                >
                  <Fingerprint size={18} />
                  使用 Passkey 快速登录
                </button>
              )}
            </>
          )}
        </form>
      </section>
    </main>
  );
}
