import { useCallback, useEffect, useRef, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Turnstile } from '@marsidev/react-turnstile';
import {
  Activity,
  AppWindow,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BellRing,
  Bot,
  Boxes,
  CheckCircle2,
  ChartNoAxesCombined,
  ChevronRight,
  CircleAlert,
  CircleOff,
  Clock3,
  CloudCog,
  Database,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Layers3,
  ListTodo,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Network,
  Play,
  Radio,
  RefreshCw,
  Rocket,
  Route,
  Send,
  Server,
  ShieldCheck,
  ShieldAlert,
  GitPullRequest,
  Sun,
  Timer,
  Trash2,
  Upload,
  User,
  X,
  Zap,
} from 'lucide-react';
import { isPlainInternalNavigation } from './navigation.js';
import { requestJson } from './api.js';
import { ConfirmDialog } from './UiControls.jsx';
import AutomationView from './AutomationView.jsx';
import NotificationServiceView from './NotificationServiceView.jsx';
import {
  ConfigurationView,
  DiagnosticsView,
  PublicStatusView,
  TaskCenterView,
} from './PlatformControlViews.jsx';
import {
  BackupQualityStrip,
  IncidentsView,
  MonitoringView,
  OverviewOperations,
  ReleasesView,
  SecurityAuditView,
} from './OperationsViews.jsx';

const FILTERS = [
  { id: 'all', label: '运行总览', icon: LayoutDashboard },
  { id: 'miniapp', label: '应用中心', icon: AppWindow },
  { id: 'service', label: '服务运维', icon: Server },
  { id: 'notification', label: '通知通道', icon: Send },
  { id: 'monitoring', label: '监控分析', icon: ChartNoAxesCombined },
  { id: 'incidents', label: '告警事件', icon: BellRing },
  { id: 'automation', label: '自动化中心', icon: Bot },
  { id: 'backup', label: '数据灾备', icon: Database },
  { id: 'releases', label: '发布中心', icon: Rocket },
  { id: 'tasks', label: '任务中心', icon: ListTodo },
  { id: 'configuration', label: '配置中心', icon: GitPullRequest },
  { id: 'diagnostics', label: '链路诊断', icon: Route },
  { id: 'security', label: '安全审计', icon: ShieldCheck },
];

const CATEGORY_LABELS = {
  miniapp: '应用',
  service: '服务',
  automation: '自动化',
};

const SERVICE_ICONS = {
  core: Boxes,
  exam: GraduationCap,
  campus: AppWindow,
  mqtt: Radio,
  notify: Bell,
  'ct8-automation': Bot,
};

const STATE_META = {
  healthy: { label: '运行正常', shortLabel: '在线', className: 'healthy', icon: CheckCircle2 },
  degraded: { label: '响应异常', shortLabel: '异常', className: 'degraded', icon: CircleAlert },
  offline: { label: '暂不可用', shortLabel: '离线', className: 'offline', icon: CircleOff },
  unmonitored: { label: '未接入监测', shortLabel: '未监测', className: 'unmonitored', icon: Clock3 },
};

const STATE_PRIORITY = {
  offline: 0,
  degraded: 1,
  unmonitored: 2,
  healthy: 3,
};

function hasRole(role, required) {
  const levels = { viewer: 1, operator: 2, super_admin: 3 };
  return (levels[role] || 0) >= (levels[required] || 0);
}

function formatCheckedAt(value) {
  if (!value) return '尚未检查';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return '暂无';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function LoginScreen({ onAuthenticated, totpRequired = false }) {
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
  const turnstileRef = useRef(null);

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
          <span className="brand-mark glowing-pulse" aria-hidden="true">M</span>
          <span>
            <strong>MY PLATFORM</strong>
            <small>统一服务控制台 · UNIFIED CONSOLE</small>
          </span>
        </div>

        <div className="login-heading">
          <span className="login-icon">
            {secondFactorRequired ? <KeyRound size={22} /> : <LockKeyhole size={22} />}
          </span>
          <div>
            <h1 id="login-title">
              {secondFactorRequired ? '安全二次验证' : '管理员身份验证'}
            </h1>
            <p>
              {secondFactorRequired
                ? '为了确保您的账户安全，请输入 6 位动态验证码'
                : '登录后掌控平台运维、身份与灾备系统'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {recoveryCodes.length > 0 ? (
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

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <span className="brand-mark">统</span>
      <div>
        <strong>统一服务控制台</strong>
        <span><LoaderCircle className="spin" size={15} /> 正在连接服务</span>
      </div>
    </main>
  );
}

function SessionUnavailableScreen({ error, onRetry, retrying }) {
  return (
    <main className="session-error-screen" role="alert">
      <CircleOff size={32} aria-hidden="true" />
      <strong>管理服务暂时不可用</strong>
      <span>{error?.message || '无法确认当前会话，请稍后重试。'}</span>
      <button className="primary-button compact" type="button" onClick={onRetry} disabled={retrying}>
        {retrying ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
        {retrying ? '正在重试' : '重新连接'}
      </button>
    </main>
  );
}

function OperationsChart({ services, history = {} }) {
  const chartServices = services
    .filter((service) => Number.isFinite(service.latencyMs))
    .slice(0, 6);
  const items = chartServices.length > 0 ? chartServices : services.slice(0, 6);
  const values = items.map((service) => service.latencyMs || 0);
  const fastest = values.length > 0 ? Math.min(...values) : null;
  const onlineValues = items
    .filter((service) => !['offline', 'unmonitored'].includes(service.state) && Number.isFinite(service.latencyMs))
    .map((service) => service.latencyMs);
  const average = onlineValues.length > 0
    ? Math.round(onlineValues.reduce((sum, value) => sum + value, 0) / onlineValues.length)
    : null;
  const peak = values.length > 0 ? Math.max(...values) : null;
  const series = items.map((service) => {
    const persisted = history[service.id]?.samples || [];
    const samples = persisted.filter((sample) => Number.isFinite(sample.latencyMs));
    return {
      service,
      samples: samples.length ? samples : Number.isFinite(service.latencyMs)
        ? [{ recordedAt: service.checkedAt || new Date().toISOString(), latencyMs: service.latencyMs }]
        : [],
    };
  });
  const historyValues = series.flatMap((entry) => entry.samples.map((sample) => sample.latencyMs));
  const historyTimes = series.flatMap((entry) => entry.samples.map((sample) => Date.parse(sample.recordedAt))).filter(Number.isFinite);
  const maximum = Math.max(...historyValues, 1);
  const minimumPositive = Math.min(...historyValues.filter((value) => value > 0), maximum);
  const useLogScale = maximum / Math.max(minimumPositive, 1) >= 10;
  const scaleLatency = (value) => useLogScale ? Math.log10(value + 1) : value;
  const scaledMaximum = scaleLatency(maximum);
  const startTime = Math.min(...historyTimes, Date.now());
  const endTime = Math.max(...historyTimes, startTime + 1);
  const width = 620;
  const height = 220;
  const xStart = 28;
  const xEnd = 592;
  const xFor = (recordedAt) => xStart + ((Date.parse(recordedAt) - startTime) / (endTime - startTime)) * (xEnd - xStart);
  const yFor = (latencyMs) => 178 - (scaleLatency(latencyMs) / scaledMaximum) * 116;
  const colors = ['#2877f7', '#11ad78', '#ff8a00', '#8a45ef', '#d75467', '#13bad6'];

  return (
    <div className="operations-chart">
      <div className="chart-summary" aria-label="响应时间摘要">
        <span className="fast"><i /> 最快 {fastest === null ? '--' : `${fastest} ms`}</span>
        <span className="average"><i /> 在线平均 {average === null ? '--' : `${average} ms`}</span>
        <span className="peak"><i /> 峰值 {peak === null ? '--' : `${peak} ms`}</span>
      </div>
      {items.length > 0 ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="服务响应与健康状态趋势图">
            <defs>
              <linearGradient id="chart-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#23c4df" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#23c4df" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[60, 118, 178].map((y) => <line className="chart-grid-line" key={y} x1="22" x2="598" y1={y} y2={y} />)}
            {series.map((entry, index) => {
              const points = entry.samples.map((sample) => `${xFor(sample.recordedAt)},${yFor(sample.latencyMs)}`).join(' ');
              return points ? <polyline className="chart-line" key={entry.service.id} points={points} style={{ stroke: colors[index] }} /> : null;
            })}
          </svg>
          <div className="chart-service-legend">
            {series.map((entry, index) => <span key={entry.service.id}><i style={{ background: colors[index] }} />{entry.service.shortName || entry.service.name}</span>)}
          </div>
        </>
      ) : (
        <div className="chart-empty"><LoaderCircle className="spin" size={18} /> 正在同步服务趋势</div>
      )}
    </div>
  );
}

function ServicePortfolioRow({ service, history, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || Server;
  const meta = STATE_META[service.state] || STATE_META.unmonitored;
  const persistedValues = (history?.samples || []).map((sample) => sample.latencyMs).filter(Number.isFinite).slice(-5);
  const values = persistedValues.length ? persistedValues : [Math.max(service.latencyMs || 0, 0)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, pointIndex) => {
    const x = 4 + pointIndex * 22;
    const y = 36 - ((value - min) / Math.max(max - min, 1)) * 26;
    return `${x},${y}`;
  }).join(' ');

  function handleOpen(event) {
    if (!service.adminUrl) return;
    if (!isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  const content = (
    <>
      <span className={`portfolio-icon service-${service.category}`}><Icon size={16} /></span>
      <span className="portfolio-copy">
        <strong>{service.shortName || service.name}</strong>
        <span className={meta.className}><i /> {meta.label}</span>
      </span>
      <span className="portfolio-value">
        <strong>{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</strong>
        <small>{service.httpStatus ? `状态码 ${service.httpStatus}` : meta.shortLabel}</small>
      </span>
      <svg className={`sparkline ${meta.className}`} viewBox="0 0 96 42" aria-hidden="true">
        <polyline points={points} />
        {points.split(' ').map((point, pointIndex) => {
          const [cx, cy] = point.split(',');
          return <circle key={pointIndex} cx={cx} cy={cy} r="2.2" />;
        })}
      </svg>
      {service.adminUrl && <ChevronRight className="portfolio-chevron" size={15} />}
    </>
  );

  return service.adminUrl ? (
    <a
      className="portfolio-row"
      href={service.adminUrl}
      target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
      rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
      onClick={handleOpen}
      aria-label={`进入${service.name}后台`}
    >
      {content}
    </a>
  ) : <div className="portfolio-row disabled">{content}</div>;
}

function ServiceStatus({ state }) {
  const meta = STATE_META[state] || STATE_META.unmonitored;
  const Icon = meta.icon;
  return (
    <span className={`service-status ${meta.className}`}>
      <Icon size={14} />
      {meta.label}
    </span>
  );
}

function ApplicationTile({ service, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || AppWindow;

  function handleOpen(event) {
    if (!service.adminUrl || !isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  return (
    <article className="application-tile">
      <header>
        <span className="application-tile-icon"><Icon size={23} /></span>
        <div>
          <span>{CATEGORY_LABELS[service.category]}</span>
          <h3>{service.name}</h3>
        </div>
        <ServiceStatus state={service.state} />
      </header>
      <p>{service.description}</p>
      <div className="application-capabilities">
        {service.capabilities.slice(0, 4).map((capability) => <span key={capability}>{capability}</span>)}
      </div>
      <footer>
        <dl>
          <div><dt>响应时间</dt><dd>{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</dd></div>
          <div><dt>检查时间</dt><dd>{formatCheckedAt(service.checkedAt)}</dd></div>
        </dl>
        {service.adminUrl ? (
          <a
            href={service.adminUrl}
            target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
            rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
            onClick={handleOpen}
          >
            打开应用 <ArrowUpRight size={16} />
          </a>
        ) : <span className="entry-unavailable">未配置入口</span>}
      </footer>
    </article>
  );
}

function OverviewView({
  services,
  counts,
  total,
  healthyRate,
  attentionCount,
  loading,
  environmentLabel,
  monitoringEnabled,
  setMonitoringEnabled,
  primaryService,
  launchService,
  refreshedAt,
  operationsSummary,
  onOpenIncidents,
  onOpenAudit,
}) {
  const sortedServices = [...services].sort((left, right) => (
    (STATE_PRIORITY[left.state] ?? 4) - (STATE_PRIORITY[right.state] ?? 4)
    || left.name.localeCompare(right.name, 'zh-CN')
  ));

  return (
    <div className="overview-page">
      <section className="dashboard-grid" aria-label="系统运行总览">
      <article className="dashboard-card performance-card">
        <div className="platform-pass">
          <div className="pass-topline">
            <span>统一服务云</span>
            <span className="pass-layer"><Layers3 size={17} /></span>
          </div>
          <span className="pass-count">{counts.healthy || 0} / {total || '--'}</span>
          <div className="pass-bottomline">
            <Activity size={25} />
            <strong>{environmentLabel === '生产环境' ? '在线' : '开发'}</strong>
          </div>
          <svg className="pass-wave" viewBox="0 0 640 120" aria-hidden="true">
            <path d="M0 95 C105 38 205 45 306 91 S522 115 640 38" />
            <path d="M0 116 C136 65 236 76 352 111 S550 123 640 80" />
          </svg>
        </div>

        <div className="performance-heading">
          <div>
            <span>服务可用率</span>
            <strong>{loading ? '--' : `${healthyRate.toFixed(1)}%`}</strong>
          </div>
          <span className="performance-state">
            <i /> {attentionCount > 0 ? `${attentionCount} 项待处理` : '运行平稳'}
          </span>
        </div>
        <OperationsChart services={services} history={operationsSummary?.history} />
      </article>

      <article className="dashboard-card monitoring-card">
        <div>
          <span className="card-eyebrow">实时监测</span>
          <h2>{monitoringEnabled ? '页面自动刷新已开启' : '页面自动刷新已暂停'}</h2>
          <p>{monitoringEnabled ? '每 30 秒同步服务端监测结果' : '服务端持续监测不受影响'}</p>
        </div>
        <span className="monitoring-icon"><CloudCog size={24} /></span>
        <button
          className={`toggle-switch ${monitoringEnabled ? 'active' : ''}`}
          type="button"
          role="switch"
          aria-checked={monitoringEnabled}
          aria-label="自动监测"
          onClick={() => setMonitoringEnabled((enabled) => !enabled)}
        >
          <span />
        </button>
      </article>

      <article className="dashboard-card service-entry-card">
        <div className="service-entry-copy">
          <span className="entry-icon"><CloudCog size={19} /></span>
          <div>
            <h2>统一服务中心</h2>
            <p>统一访问核心平台、考试、校园与消息服务</p>
          </div>
          <button
            className="entry-action"
            type="button"
            disabled={!primaryService}
            onClick={() => launchService(primaryService)}
            aria-label="进入统一服务中心"
            title="进入统一服务中心"
          >
            <ArrowRight size={21} />
          </button>
        </div>
        <div className="service-visual" aria-hidden="true">
          <span className="visual-card visual-card-one"><Server size={25} /></span>
          <span className="visual-card visual-card-two"><Boxes size={27} /></span>
          <span className="visual-card visual-card-three"><Zap size={24} /></span>
          <i className="visual-link link-one" />
          <i className="visual-link link-two" />
        </div>
      </article>

      <article className="dashboard-card portfolio-card">
        <header>
          <div>
            <span className="card-eyebrow">服务</span>
            <h2>服务组合</h2>
          </div>
          <span className="portfolio-count">{sortedServices.length}</span>
        </header>
        <div className="portfolio-list">
          {sortedServices.length > 0 ? sortedServices.map((service) => (
            <ServicePortfolioRow key={service.id} service={service} history={operationsSummary?.history?.[service.id]} onLaunch={launchService} />
          )) : (
            <div className="portfolio-empty">暂无服务数据</div>
          )}
        </div>
        <footer>
          <span><i /> {total} 项服务已接入</span>
          <span>更新于 {formatCheckedAt(refreshedAt)}</span>
        </footer>
      </article>
      </section>
      <OverviewOperations summary={operationsSummary} onOpenIncidents={onOpenIncidents} onOpenAudit={onOpenAudit} />
    </div>
  );
}

function ApplicationsView({ services, loading, onLaunch }) {
  const applications = services.filter((service) => service.category === 'miniapp');
  const healthyApplications = applications.filter((service) => service.state === 'healthy').length;
  const availability = applications.length > 0 ? Math.round((healthyApplications / applications.length) * 100) : 0;

  return (
    <section className="page-view applications-view" aria-label="应用中心">
      <div className="applications-layout">
        <div className="application-catalog">
          {loading ? (
            <div className="view-loading"><LoaderCircle className="spin" size={20} /> 正在加载应用</div>
          ) : applications.length > 0 ? applications.map((service) => (
            <ApplicationTile key={service.id} service={service} onLaunch={onLaunch} />
          )) : <div className="view-empty">暂无已接入应用</div>}
        </div>

        <aside className="application-insights">
          <section className="view-card availability-panel">
            <span className="view-card-icon"><AppWindow size={21} /></span>
            <span>应用可用率</span>
            <strong>{availability}%</strong>
            <div className="availability-bar"><i style={{ width: `${availability}%` }} /></div>
            <p>{healthyApplications} 个应用运行正常，共接入 {applications.length} 个应用。</p>
          </section>
          <section className="view-card check-panel">
            <header><h3>最近检查</h3><Timer size={18} /></header>
            {applications.map((service) => (
              <div className="check-row" key={service.id}>
                <span><i className={STATE_META[service.state]?.className} />{service.shortName || service.name}</span>
                <strong>{formatCheckedAt(service.checkedAt)}</strong>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}

function ServiceTableRow({ service, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || Server;

  function handleOpen(event) {
    if (!service.adminUrl || !isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  return (
    <div className="service-table-row">
      <div className="service-table-name">
        <span><Icon size={19} /></span>
        <div><strong>{service.shortName || service.name}</strong><small>{service.repositoryPath}</small></div>
      </div>
      <ServiceStatus state={service.state} />
      <span className="table-value">{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</span>
      <span className="table-value">{service.httpStatus ?? '--'}</span>
      <span className="table-value">{formatCheckedAt(service.checkedAt)}</span>
      {service.adminUrl ? (
        <a
          className="table-entry"
          href={service.adminUrl}
          target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
          rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
          onClick={handleOpen}
          aria-label={`进入${service.name}`}
        ><ArrowUpRight size={17} /></a>
      ) : <span className="table-entry disabled">--</span>}
    </div>
  );
}

function ServicesView({ services, loading, onLaunch }) {
  const infrastructure = services.filter((service) => service.category === 'service');
  const healthy = infrastructure.filter((service) => service.state === 'healthy').length;
  const attention = infrastructure.filter((service) => ['offline', 'degraded'].includes(service.state)).length;
  const unmonitored = infrastructure.filter((service) => service.state === 'unmonitored').length;
  const latencies = infrastructure
    .filter((service) => !['offline', 'unmonitored'].includes(service.state))
    .map((service) => service.latencyMs)
    .filter(Number.isFinite);
  const averageLatency = latencies.length > 0
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null;

  return (
    <section className="page-view services-view" aria-label="服务运维">
      <div className="operations-kpis">
        <article><span className="kpi-icon blue"><Server size={20} /></span><div><span>基础服务</span><strong>{infrastructure.length}</strong><small>已接入运维</small></div></article>
        <article><span className="kpi-icon green"><CheckCircle2 size={20} /></span><div><span>运行正常</span><strong>{healthy}</strong><small>当前在线</small></div></article>
        <article><span className="kpi-icon orange"><CircleAlert size={20} /></span><div><span>需要处理</span><strong>{attention}</strong><small>异常或离线</small></div></article>
        <article><span className="kpi-icon purple"><Activity size={20} /></span><div><span>在线平均</span><strong>{averageLatency === null ? '--' : averageLatency}</strong><small>{averageLatency === null ? '暂无数据' : '响应毫秒'}</small></div></article>
      </div>

      <div className="services-layout">
        <section className="view-card service-table-card" aria-label="基础服务清单">
          <div className="service-table-head">
            <span>服务</span><span>状态</span><span>响应</span><span>状态码</span><span>检查时间</span><span />
          </div>
          <div className="service-table-body">
            {loading ? (
              <div className="view-loading"><LoaderCircle className="spin" size={20} /> 正在加载服务</div>
            ) : infrastructure.map((service) => (
              <ServiceTableRow key={service.id} service={service} onLaunch={onLaunch} />
            ))}
          </div>
        </section>

        <aside className="view-card distribution-panel">
          <header><div><span className="view-eyebrow">健康</span><h3>状态分布</h3></div><Network size={21} /></header>
          <div className="distribution-score">
            <strong>{infrastructure.length > 0 ? Math.round((healthy / infrastructure.length) * 100) : 0}%</strong>
            <span>基础服务可用率</span>
          </div>
          <div className="distribution-list">
            <div><span><i className="healthy" />运行正常</span><strong>{healthy}</strong></div>
            <div><span><i className="degraded" />需要处理</span><strong>{attention}</strong></div>
            <div><span><i className="unmonitored" />未接监测</span><strong>{unmonitored}</strong></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function BackupRecoveryView({ session }) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [deletingBackup, setDeletingBackup] = useState('');
  const [downloadingBackup, setDownloadingBackup] = useState('');
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreTotp, setRestoreTotp] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const uploadInputRef = useRef(null);

  const loadBackupStatus = useCallback(async (force = false, options = {}) => {
    const preserveMissingRunningJob = options.preserveMissingRunningJob !== false;
    force ? setRefreshing(true) : setLoading(true);
    setActionError('');
    try {
      const nextStatus = await requestJson('/api/backups/status');
      setStatusData(nextStatus);
      const statusJobs = Array.isArray(nextStatus.jobs) ? nextStatus.jobs : [];
      const running = statusJobs.find((job) => job.status === 'running') || null;
      setActiveJob((current) => {
        const currentMatch = current?.id ? statusJobs.find((job) => job.id === current.id) : null;
        if (currentMatch) return currentMatch;
        if (current?.status === 'running') {
          return running || (preserveMissingRunningJob ? current : null);
        }
        return running || statusJobs[0] || current;
      });
    } catch (error) {
      setActionError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBackupStatus();
  }, [loadBackupStatus]);

  const backups = statusData?.backups || [];
  const capabilities = statusData?.capabilities || {};
  const jobs = statusData?.jobs || [];
  const runningJob = activeJob?.status === 'running'
    ? activeJob
    : jobs.find((job) => job.status === 'running') || null;
  const latestJob = activeJob || jobs[0] || null;
  const latestBackup = backups.find((backup) => backup.restorable) || backups[0] || null;
  const restoreConfirmText = capabilities.restoreConfirmText || 'RESTORE ALL DATA';

  useEffect(() => {
    if (backups.length === 0) {
      setSelectedBackup(null);
      return;
    }
    setSelectedBackup((current) => {
      if (current && backups.some((backup) => backup.name === current.name)) return current;
      return backups.find((backup) => backup.restorable) || backups[0];
    });
  }, [backups]);

  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') return undefined;
    const timer = window.setInterval(async () => {
      try {
        const result = await requestJson(`/api/backups/jobs/${encodeURIComponent(activeJob.id)}`);
        if (!result.job || result.job.id !== activeJob.id) return;
        setActiveJob(result.job);
        if (result.job.status !== 'running') {
          if (result.job.status === 'succeeded') {
            setActionError('');
            setActionMessage('任务已完成');
          } else if (result.job.status === 'failed') {
            setActionMessage('');
            setActionError(result.job.error || '任务执行失败');
          } else {
            setActionError('');
            setActionMessage('任务状态待确认，已刷新清单');
          }
          loadBackupStatus(true);
        }
      } catch (error) {
        if (error.status === 404 || error.code === 'BACKUP_JOB_NOT_FOUND') {
          setActiveJob((current) => (current?.id === activeJob.id ? null : current));
          setActionError('');
          setActionMessage('任务状态已刷新，请查看备份清单');
          await loadBackupStatus(true, { preserveMissingRunningJob: false });
          return;
        }
        setActionError(error.message);
      }
    }, 2200);
    return () => window.clearInterval(timer);
  }, [activeJob, loadBackupStatus]);

  async function handleStartBackup() {
    setActionError('');
    setActionMessage('');
    try {
      const result = await requestJson('/api/backups/run', { method: 'POST' });
      setActiveJob(result.job);
      setActionMessage('备份任务已提交');
      await loadBackupStatus(true);
    } catch (error) {
      setActionError(error.message);
    }
  }

  function handleBackupRowKeyDown(event, backup) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedBackup(backup);
  }

  async function handleDownloadBackup(backup) {
    setActionError('');
    setActionMessage('');
    if (!backup?.restorable) {
      setActionError('这个备份包不可下载');
      return;
    }
    if (!canManageBackups) {
      setActionError('仅超级管理员可以下载备份归档。');
      return;
    }
    if (!session.authDisabled && !restorePassword) {
      setActionError('请先输入当前管理员密码。');
      return;
    }
    if (!session.authDisabled && session.user?.totpEnabled && restoreTotp.length !== 6) {
      setActionError('请先输入六位动态验证码。');
      return;
    }

    setDownloadingBackup(backup.name);
    try {
      const response = await fetch(`/api/backups/${encodeURIComponent(backup.name)}/download`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform-Request': 'console',
        },
        body: JSON.stringify({ password: restorePassword, totp: restoreTotp }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `备份下载失败（HTTP ${response.status}）。`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${backup.name}.tar.gz`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setRestorePassword('');
      setRestoreTotp('');
      setActionMessage('备份下载已开始。');
    } catch (error) {
      setActionError(error.message);
    } finally {
      setDownloadingBackup('');
    }
  }

  function handleDeleteBackup(backup) {
    setActionError('');
    setActionMessage('');
    if (!backup?.name) return;
    setConfirmation({ type: 'delete', backup });
  }

  async function handleUploadBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setActionError('');
    setActionMessage('');
    setUploadingBackup(true);
    try {
      const result = await requestJson(`/api/backups/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/gzip',
        },
      });
      if (result.backup) setSelectedBackup(result.backup);
      setActionMessage('备份包已上传');
      await loadBackupStatus(true);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setUploadingBackup(false);
    }
  }

  async function handleStartRestore() {
    setActionError('');
    setActionMessage('');
    if (!selectedBackup?.name) {
      setActionError('请选择要恢复的备份');
      return;
    }
    if (!session.authDisabled && !restorePassword) {
      setActionError('请输入管理员密码');
      return;
    }
    if (!session.authDisabled && session.user?.totpEnabled && restoreTotp.length !== 6) {
      setActionError('请输入六位动态验证码');
      return;
    }
    if (confirmText !== restoreConfirmText) {
      setActionError('确认短语不正确');
      return;
    }
    setConfirmation({ type: 'restore', backup: selectedBackup });
  }

  async function handleConfirmBackupAction() {
    if (!confirmation?.backup?.name) return;
    const pending = confirmation;
    setConfirmationBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      if (pending.type === 'delete') {
        setDeletingBackup(pending.backup.name);
        await requestJson(`/api/backups/${encodeURIComponent(pending.backup.name)}`, { method: 'DELETE' });
        if (selectedBackup?.name === pending.backup.name) setSelectedBackup(null);
        setActionMessage('备份已删除');
        await loadBackupStatus(true);
      } else {
        const result = await requestJson('/api/backups/restore', {
          method: 'POST',
          body: JSON.stringify({
            backupName: pending.backup.name,
            password: restorePassword,
            totp: restoreTotp,
            confirmText,
          }),
        });
        setActiveJob(result.job);
        setRestorePassword('');
        setRestoreTotp('');
        setConfirmText('');
        setActionMessage('恢复任务已提交');
        await loadBackupStatus(true);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setDeletingBackup('');
      setConfirmationBusy(false);
      setConfirmation(null);
    }
  }

  const canOperateBackups = hasRole(session.user?.role, 'operator');
  const canManageBackups = hasRole(session.user?.role, 'super_admin');
  const canUseRestore = Boolean(canManageBackups && capabilities.canRestore && selectedBackup?.restorable && !runningJob);
  const executorHealthy = capabilities.canBackup && capabilities.canRestore;

  return (
    <section className="page-view backup-view" aria-label="数据灾备">
      <div className="page-actions">
        <button className="secondary-action" type="button" onClick={() => loadBackupStatus(true)} disabled={refreshing}>
          {refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
          {refreshing ? '正在刷新' : '刷新清单'}
        </button>
      </div>

      <BackupQualityStrip />

      <div className="backup-kpis">
        <article><span className="kpi-icon blue"><Database size={20} /></span><div><span>可用备份</span><strong>{backups.filter((backup) => backup.restorable).length}</strong><small>服务器备份目录</small></div></article>
        <article><span className="kpi-icon green"><CheckCircle2 size={20} /></span><div><span>执行器</span><strong>{executorHealthy ? '就绪' : '受限'}</strong><small>{capabilities.issues?.join('，') || '可执行备份与恢复'}</small></div></article>
        <article><span className="kpi-icon orange"><Clock3 size={20} /></span><div><span>最近备份</span><strong>{formatDateTime(latestBackup?.createdAt)}</strong><small>{latestBackup?.name || '暂无归档'}</small></div></article>
        <article><span className="kpi-icon purple"><ShieldCheck size={20} /></span><div><span>高危操作保护</span><strong>{session.authDisabled ? '确认短语' : session.user?.totpEnabled ? '双重验证' : '密码验证'}</strong><small>下载与恢复均需二次验证</small></div></article>
      </div>

      {(actionError || actionMessage) && (
        <div className={`backup-feedback ${actionError ? 'error' : 'success'}`} role="status">
          {actionError ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>{actionError || actionMessage}</span>
        </div>
      )}

      <div className="backup-layout">
        <section className="view-card backup-action-card">
          <header className="section-bar">
            <div><h3>创建备份</h3><span>{capabilities.backupRoot || '备份目录未配置'}</span></div>
            <Database size={21} />
          </header>
          <div className="backup-action-copy">
            <strong>{capabilities.canBackup ? '全量备份已接入' : '备份执行器不可用'}</strong>
            <span>备份由独立执行器在线创建 MongoDB 归档并复制核心上传文件，不主动停止业务容器。</span>
          </div>
          <button
            className="primary-button backup-primary-action"
            type="button"
            onClick={handleStartBackup}
            disabled={!canOperateBackups || !capabilities.canBackup || Boolean(runningJob)}
          >
            {runningJob?.type === 'backup' ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
            {runningJob?.type === 'backup' ? '正在备份' : '立即备份'}
          </button>
        </section>

        <section className="view-card backup-list-card" aria-label="备份清单">
          <div className="backup-table-head">
            <span>备份</span><span>时间</span><span>大小</span><span>状态</span><span>操作</span>
          </div>
          <div className="backup-table-body">
            {loading ? (
              <div className="view-loading"><LoaderCircle className="spin" size={20} /> 正在加载备份清单</div>
            ) : backups.length > 0 ? backups.map((backup) => (
              <div
                key={backup.name}
                className={`backup-row ${selectedBackup?.name === backup.name ? 'selected' : ''} ${backup.restorable ? '' : 'invalid'}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedBackup(backup)}
                onKeyDown={(event) => handleBackupRowKeyDown(event, backup)}
              >
                <span><strong>{backup.name}</strong><small>{backup.includes?.join(' / ') || '清单不可读'}</small></span>
                <span>{formatDateTime(backup.createdAt)}</span>
                <span>{formatBytes(backup.sizeBytes)}</span>
                <span className={backup.restorable ? 'healthy' : 'degraded'}>{backup.restorable ? '可恢复' : '不可用'}</span>
                <span className="backup-row-actions">
                  <button
                    className="backup-row-action"
                    type="button"
                    aria-label={`下载备份 ${backup.name}`}
                    title="下载备份"
                    disabled={!canManageBackups || !backup.restorable || downloadingBackup === backup.name}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDownloadBackup(backup);
                    }}
                  >
                    {downloadingBackup === backup.name ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
                  </button>
                  <button
                    className="backup-row-action danger"
                    type="button"
                    aria-label={`删除备份 ${backup.name}`}
                    title="删除备份"
                    disabled={!canManageBackups || Boolean(runningJob) || deletingBackup === backup.name}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteBackup(backup);
                    }}
                  >
                    {deletingBackup === backup.name ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                  </button>
                </span>
              </div>
            )) : (
              <div className="view-empty">暂无备份归档</div>
            )}
          </div>
        </section>

        <aside className="view-card restore-card">
          <header>
            <div><span className="view-eyebrow">恢复</span><h3>高危恢复</h3></div>
            <CircleAlert size={21} />
          </header>
          <div className="restore-target">
            <span>目标备份</span>
            <strong>{selectedBackup?.name || '未选择'}</strong>
            <small>{selectedBackup ? formatDateTime(selectedBackup.createdAt) : '请从备份清单选择'}</small>
          </div>
          <p className="restore-warning">恢复提交后会先创建当前状态备份，再执行覆写。</p>
          <input
            ref={uploadInputRef}
            className="backup-upload-input"
            type="file"
            accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
            onChange={handleUploadBackup}
          />
          <button
            className="secondary-action backup-upload-action"
            type="button"
            disabled={!canOperateBackups || Boolean(runningJob) || uploadingBackup}
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploadingBackup ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
            {uploadingBackup ? '正在上传' : '上传备份包'}
          </button>
          {!session.authDisabled && (
            <label className="restore-field">
              <span>管理员密码（下载 / 恢复）</span>
              <input
                type="password"
                autoComplete="current-password"
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
                placeholder="当前平台登录密码"
              />
            </label>
          )}
          {!session.authDisabled && session.user?.totpEnabled && (
            <label className="restore-field">
              <span>动态验证码（下载 / 恢复）</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={restoreTotp}
                onChange={(event) => setRestoreTotp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="六位验证码"
              />
            </label>
          )}
          <label className="restore-field">
            <span>确认短语</span>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={restoreConfirmText}
            />
          </label>
          <div className="restore-confirm-text">{restoreConfirmText}</div>
          <button
            className="danger-button"
            type="button"
            disabled={!canUseRestore || confirmText !== restoreConfirmText || (!session.authDisabled && (!restorePassword || (session.user?.totpEnabled && restoreTotp.length !== 6)))}
            onClick={handleStartRestore}
          >
            {runningJob?.type === 'restore' ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            {runningJob?.type === 'restore' ? '正在恢复' : '执行恢复'}
          </button>
        </aside>
      </div>

      {latestJob && (
        <section className={`view-card backup-job-card job-${latestJob.status}`}>
          <header className="section-bar">
            <div><h3>最近任务</h3><span>{latestJob.type === 'backup' ? '备份任务' : '恢复任务'} · {latestJob.status}</span></div>
            {latestJob.status === 'running' ? <LoaderCircle className="spin" size={21} /> : <CheckCircle2 size={21} />}
          </header>
          <div className="backup-job-grid">
            <div><span>发起人</span><strong>{latestJob.requestedBy || 'admin'}</strong></div>
            <div><span>开始时间</span><strong>{formatDateTime(latestJob.startedAt)}</strong></div>
            <div><span>结束时间</span><strong>{formatDateTime(latestJob.finishedAt)}</strong></div>
            <div><span>退出码</span><strong>{latestJob.exitCode ?? '--'}</strong></div>
          </div>
          {(latestJob.error || latestJob.stdout || latestJob.stderr) && (
            <pre className="backup-job-log">{[
              latestJob.error,
              !latestJob.error && latestJob.stderr && `stderr:\n${latestJob.stderr}`,
              !latestJob.error && latestJob.stdout && `stdout:\n${latestJob.stdout}`,
            ].filter(Boolean).join('\n\n')}</pre>
          )}
        </section>
      )}
      <ConfirmDialog
        open={Boolean(confirmation)}
        tone="danger"
        title={confirmation?.type === 'restore' ? '确认恢复数据库' : '确认删除备份'}
        description={confirmation?.type === 'restore'
          ? '恢复操作会先备份当前状态，再使用所选归档覆写现有数据库。执行期间请勿关闭服务。'
          : '删除后该备份归档将无法找回，请确认它不再用于恢复或审计。'}
        detail={confirmation?.backup?.name}
        confirmLabel={confirmation?.type === 'restore' ? '确认恢复' : '删除备份'}
        busy={confirmationBusy}
        onCancel={() => setConfirmation(null)}
        onConfirm={handleConfirmBackupAction}
      />
    </section>
  );
}

function Dashboard({ session, onLogout }) {
  const [activeFilter, setActiveFilter] = useState(() => {
    const requestedView = new URLSearchParams(window.location.search).get('view');
    return FILTERS.some(({ id }) => id === requestedView) ? requestedView : 'all';
  });
  const [data, setData] = useState(null);
  const [operationsSummary, setOperationsSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [launchingService, setLaunchingService] = useState(null);
  const [monitoringEnabled, setMonitoringEnabled] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('my-console-theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const mobileMenuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const notificationRef = useRef(null);
  const loadRequestRef = useRef(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeFilter === 'all') url.searchParams.delete('view');
    else url.searchParams.set('view', activeFilter);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [activeFilter]);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    if (window.matchMedia('(max-width: 980px)').matches) {
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  }, []);

  const loadServices = useCallback((force = false) => {
    if (loadRequestRef.current) return loadRequestRef.current;
    force ? setRefreshing(true) : setLoading(true);
    setError('');
    const request = (async () => {
      try {
        const overview = await requestJson(`/api/operations/overview${force ? '?refresh=1' : ''}`);
        setOperationsSummary(overview);
        setData({
          platformName: overview.platformName,
          services: overview.services,
          counts: overview.counts,
          refreshedAt: overview.refreshedAt,
        });
      } catch (requestError) {
        if (requestError.status === 401) {
          onLogout();
          return;
        }
        setError(requestError.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();
    loadRequestRef.current = request;
    request.finally(() => {
      if (loadRequestRef.current === request) loadRequestRef.current = null;
    });
    return request;
  }, [onLogout]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('my-console-theme', theme);
    } catch {
      // Theme still applies for the current page when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    if (!monitoringEnabled) return undefined;
    let disposed = false;
    let timer = null;
    const canPoll = () => document.visibilityState === 'visible' && navigator.onLine !== false;
    const clearTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clearTimer();
      if (!disposed && canPoll()) timer = window.setTimeout(run, 30000);
    };
    const run = async () => {
      if (canPoll()) await loadServices(true);
      schedule();
    };
    const resume = () => {
      clearTimer();
      if (!disposed && canPoll()) loadServices(true).finally(schedule);
    };
    const handleVisibility = () => (canPoll() ? resume() : clearTimer());

    schedule();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', resume);
    window.addEventListener('offline', clearTimer);
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', clearTimer);
    };
  }, [loadServices, monitoringEnabled]);

  useEffect(() => {
    function clearLaunchState() {
      setLaunchingService(null);
    }
    window.addEventListener('pageshow', clearLaunchState);
    window.addEventListener('focus', clearLaunchState);
    return () => {
      window.removeEventListener('pageshow', clearLaunchState);
      window.removeEventListener('focus', clearLaunchState);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen || !window.matchMedia('(max-width: 980px)').matches) return undefined;
    const sidebar = sidebarRef.current;
    const focusable = Array.from(sidebar?.querySelectorAll('button:not(:disabled), a[href]') || []);
    if (focusable.length === 0) return undefined;
    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];
    firstFocusable.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileNav();
        return;
      }
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeMobileNav, mobileNavOpen]);

  useEffect(() => {
    if (!notificationOpen) return undefined;
    function closeNotification(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && notificationRef.current?.contains(event.target)) return;
      setNotificationOpen(false);
    }
    document.addEventListener('pointerdown', closeNotification);
    document.addEventListener('keydown', closeNotification);
    return () => {
      document.removeEventListener('pointerdown', closeNotification);
      document.removeEventListener('keydown', closeNotification);
    };
  }, [notificationOpen]);

  const services = data?.services || [];
  const counts = data?.counts || {};
  const total = services.length;
  const attentionCount = (counts.degraded || 0) + (counts.offline || 0);
  const healthyRate = total > 0 ? Math.round(((counts.healthy || 0) / total) * 100) : 0;
  const environmentLabel = session.authDisabled ? '开发环境' : '生产环境';
  const username = session.user?.username || 'admin';
  const greeting = getGreeting();

  async function handleLogout() {
    try {
      await requestJson('/api/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
    }
  }

  const launchService = useCallback((service) => {
    if (!service?.adminUrl || launchingService) return;
    setLaunchingService(service);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.location.assign(service.adminUrl));
    });
  }, [launchingService]);

  const primaryService = services.find((service) => service.id === 'core' && service.adminUrl)
    || services.find((service) => service.adminUrl);
  const viewMeta = {
    miniapp: { title: '应用中心', subtitle: '应用入口与运行状态' },
    service: { title: '服务运维', subtitle: '基础服务健康监测' },
    notification: { title: '企业微信通知', subtitle: '通道状态与发送台账' },
    monitoring: { title: '监控分析', subtitle: '可用率与真实历史趋势' },
    incidents: { title: '告警事件', subtitle: '发现、确认与处置异常' },
    automation: { title: '自动化中心', subtitle: '任务能力与观测链路' },
    backup: { title: '数据灾备', subtitle: '备份恢复与灾难演练' },
    releases: { title: '发布中心', subtitle: '版本、构建与部署保护' },
    tasks: { title: '统一任务中心', subtitle: '跨服务任务状态与处理入口' },
    configuration: { title: '配置中心', subtitle: '受控变更、审批与版本回滚' },
    diagnostics: { title: '链路诊断', subtitle: '公网网关与服务直连阶段追踪' },
    security: { title: '安全审计', subtitle: '会话安全与操作记录' },
  }[activeFilter];

  return (
    <div className="app-shell">
      {launchingService && (
        <div className="navigation-transition" role="status" aria-live="polite">
          <div className="navigation-transition-panel">
            <span><LoaderCircle className="spin" size={23} /></span>
            <div><strong>正在进入{launchingService.shortName || launchingService.name}</strong><small>正在建立安全连接，请稍候</small></div>
          </div>
        </div>
      )}

      <aside ref={sidebarRef} id="management-sidebar" className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <nav className="main-nav" aria-label="管理模块">
          {FILTERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={activeFilter === id ? 'active' : ''}
              onClick={() => {
                setActiveFilter(id);
                closeMobileNav();
              }}
              title={label}
              aria-label={label}
              aria-pressed={activeFilter === id}
              type="button"
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
          <button type="button" onClick={() => loadServices(true)} disabled={refreshing} title="刷新服务状态">
            <RefreshCw className={refreshing ? 'spin' : ''} size={19} />
            <span>刷新状态</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="environment-indicator" title={`当前环境：${environmentLabel}`}><i /></span>
          <button type="button" onClick={handleLogout} title="退出登录" aria-label="退出登录">
            <LogOut size={18} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-backdrop" type="button" aria-label="关闭导航" onClick={closeMobileNav} />}

      <main className="workspace" aria-hidden={mobileNavOpen || undefined} inert={mobileNavOpen || undefined}>
        <header className="topbar">
          <div className="topbar-leading">
            <button
              ref={mobileMenuButtonRef}
              className="icon-button mobile-menu-button"
              type="button"
              onClick={() => (mobileNavOpen ? closeMobileNav() : setMobileNavOpen(true))}
              aria-label={mobileNavOpen ? '关闭导航' : '打开导航'}
              aria-expanded={mobileNavOpen}
              aria-controls="management-sidebar"
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <img className="welcome-avatar" src="/assets/console-avatar.jpg" alt="管理员头像" />
            <div className="welcome-copy">
              {activeFilter === 'all' ? (
                <h1>{greeting}，<strong>{username}</strong></h1>
              ) : <h1><strong>{viewMeta.title}</strong></h1>}
              <span>{activeFilter === 'all' ? '统一服务控制台' : viewMeta.subtitle}</span>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="environment-label"><i /> {environmentLabel}</span>
            <button
              className="theme-switch"
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
              title={theme === 'light' ? '深色模式' : '浅色模式'}
            >
              <Moon size={14} />
              <span className={theme === 'dark' ? 'dark' : ''}><Sun size={14} /></span>
            </button>
            <div ref={notificationRef} className="notification-wrap">
              <button
                className="icon-button notification-button"
                type="button"
                aria-label="查看系统通知"
                aria-expanded={notificationOpen}
                onClick={() => setNotificationOpen((open) => !open)}
              >
                <Bell size={19} />
                <i className={(operationsSummary?.incidents?.length || attentionCount) > 0 ? 'attention' : ''} />
              </button>
              {notificationOpen && (
                <div className="notification-popover" role="status">
                  <strong>{operationsSummary?.incidents?.length > 0 ? `${operationsSummary.incidents.length} 项事件需要处理` : '系统运行平稳'}</strong>
                  {(operationsSummary?.incidents || []).slice(0, 3).map((incident) => <span key={incident.id}>{incident.title}</span>)}
                  <button type="button" onClick={() => { setNotificationOpen(false); setActiveFilter('incidents'); }}>进入事件中心</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="workspace-content">
          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button type="button" onClick={() => loadServices(true)}>重新加载</button>
            </div>
          )}

          {activeFilter === 'all' && (
            <OverviewView
              services={services}
              counts={counts}
              total={total}
              healthyRate={healthyRate}
              attentionCount={attentionCount}
              loading={loading}
              environmentLabel={environmentLabel}
              monitoringEnabled={monitoringEnabled}
              setMonitoringEnabled={setMonitoringEnabled}
              primaryService={primaryService}
              launchService={launchService}
              refreshedAt={data?.refreshedAt}
              operationsSummary={operationsSummary}
              onOpenIncidents={() => setActiveFilter('incidents')}
              onOpenAudit={() => setActiveFilter('security')}
            />
          )}
          {activeFilter === 'miniapp' && <ApplicationsView services={services} loading={loading} onLaunch={launchService} />}
          {activeFilter === 'service' && <ServicesView services={services} loading={loading} onLaunch={launchService} />}
          {activeFilter === 'notification' && <NotificationServiceView session={session} />}
          {activeFilter === 'monitoring' && <MonitoringView services={services} />}
          {activeFilter === 'incidents' && <IncidentsView session={session} />}
          {activeFilter === 'automation' && (
            <AutomationView
              services={services}
              loading={loading}
              refreshing={refreshing}
              onRefresh={() => loadServices(true)}
              onLaunch={launchService}
              session={session}
            />
          )}
          {activeFilter === 'backup' && <BackupRecoveryView session={session} />}
          {activeFilter === 'releases' && <ReleasesView session={session} />}
          {activeFilter === 'tasks' && <TaskCenterView onNavigate={setActiveFilter} />}
          {activeFilter === 'configuration' && <ConfigurationView session={session} />}
          {activeFilter === 'diagnostics' && <DiagnosticsView services={services} session={session} />}
          {activeFilter === 'security' && <SecurityAuditView session={session} onLogout={onLogout} />}
        </div>
      </main>
    </div>
  );
}

function AuthenticatedApp() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  const finishAuthentication = useCallback((nextSession) => {
    setSession(nextSession);
    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '';
    if (nextSession?.authenticated && /^\/apps\/(core|exam|campus|iot)(?:\/|$)/.test(returnTo)) {
      window.location.replace(returnTo);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setCheckingSession(true);
    setSessionError(null);
    try {
      finishAuthentication(await requestJson('/api/auth/status'));
    } catch (error) {
      if (error.status === 401) {
        setSession({ authenticated: false, authDisabled: false, user: null });
      } else {
        setSessionError(error);
      }
    } finally {
      setCheckingSession(false);
    }
  }, [finishAuthentication]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (checkingSession) return <LoadingScreen />;
  if (sessionError) return <SessionUnavailableScreen error={sessionError} onRetry={checkSession} retrying={checkingSession} />;
  if (!session?.authenticated) return <LoginScreen onAuthenticated={finishAuthentication} totpRequired={session?.totpRequired} />;
  return <Dashboard session={session} onLogout={() => setSession({ authenticated: false, authDisabled: false, totpRequired: Boolean(session.user?.totpEnabled), user: null })} />;
}

export default function App() {
  if (window.location.pathname === '/status') return <PublicStatusView />;
  return <AuthenticatedApp />;
}
