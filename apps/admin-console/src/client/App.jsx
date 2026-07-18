import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleOff,
  Clock3,
  CloudCog,
  Database,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Network,
  Play,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Sun,
  Timer,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { isPlainInternalNavigation } from './navigation.js';

const FILTERS = [
  { id: 'all', label: '运行总览', icon: LayoutDashboard },
  { id: 'miniapp', label: '应用中心', icon: AppWindow },
  { id: 'service', label: '服务运维', icon: Server },
  { id: 'automation', label: '自动化中心', icon: Bot },
  { id: 'backup', label: '数据灾备', icon: Database },
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

const CT8_API_BASE = '/apps/core/api';

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.method && options.method !== 'GET' ? { 'X-Platform-Request': 'console' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return data;
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

function formatCount(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '--';
}

function getCt8RunTime(run) {
  return run?.start_time || run?.started_at || run?.create_time || run?.createdAt || null;
}

function formatCt8RunId(value) {
  if (!value) return '--';
  const text = String(value);
  return text.length > 10 ? `#${text.slice(-10)}` : `#${text}`;
}

function getCt8StatusMeta(status, conclusion) {
  const normalized = String(status || conclusion || 'unknown').toLowerCase();
  if (normalized === 'running' || normalized === 'queued' || normalized === 'in_progress') {
    return { label: '运行中', className: 'running' };
  }
  if (normalized === 'success' || normalized === 'completed') {
    return { label: '成功', className: 'success' };
  }
  if (normalized === 'partial') {
    return { label: '部分成功', className: 'partial' };
  }
  if (normalized === 'failed' || normalized === 'failure' || normalized === 'cancelled' || normalized === 'timed_out') {
    return { label: '失败', className: 'failed' };
  }
  if (normalized === 'idle') {
    return { label: '空闲', className: 'idle' };
  }
  return { label: '暂无', className: 'unknown' };
}

function collectCt8Runs(...sources) {
  const byKey = new Map();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const run of source) {
      if (!run || typeof run !== 'object') continue;
      const key = String(run.run_id || run.id || `${getCt8RunTime(run) || ''}-${byKey.size}`);
      if (!byKey.has(key)) byKey.set(key, run);
    }
  }
  return [...byKey.values()].slice(0, 6);
}

function requestFailure(result, label) {
  if (result.status === 'rejected') {
    return `${label}：${result.reason?.message || '请求失败'}`;
  }
  const value = result.value || {};
  if (value.success === false || value.ok === false) {
    return `${label}：${value.message || value.error || '返回异常'}`;
  }
  return '';
}

function hasCt8Payload(value, type) {
  if (!value || typeof value !== 'object') return false;
  if (value.success === false || value.ok === false) return true;
  if (type === 'stats') return Boolean(value.stats || value.data?.stats);
  if (type === 'status') return Boolean(value.data?.activeTask || value.data?.latest || Array.isArray(value.data?.runs));
  if (type === 'runs') return Array.isArray(value.runs) || Array.isArray(value.data?.runs);
  return false;
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

function LoginScreen({ onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const session = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onAuthenticated(session);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">统</span>
          <span>
            <strong>统一服务控制台</strong>
            <small>统一服务控制台</small>
          </span>
        </div>
        <div className="login-heading">
          <span className="login-icon"><LockKeyhole size={20} /></span>
          <div>
            <h1 id="login-title">管理员登录</h1>
            <p>登录后进入统一服务控制台</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>管理员账号</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入管理员账号"
              required
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              required
            />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button login-button" disabled={submitting} type="submit">
            {submitting ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            {submitting ? '正在登录' : '登录'}
          </button>
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

function OperationsChart({ services }) {
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
  const maximum = Math.max(...values, 1);
  const minimumPositive = Math.min(...values.filter((value) => value > 0), maximum);
  const useLogScale = maximum / Math.max(minimumPositive, 1) >= 10;
  const scaleValue = (value) => (useLogScale ? Math.log10(value + 1) : value);
  const scaledMaximum = scaleValue(maximum);
  const width = 620;
  const height = 220;
  const xStart = 28;
  const xEnd = 592;
  const xFor = (index) => (items.length === 1
    ? width / 2
    : xStart + ((xEnd - xStart) * index) / Math.max(items.length - 1, 1));
  const latencyPoints = items.map((service, index) => ({
    x: xFor(index),
    y: 178 - (scaleValue(service.latencyMs || 0) / scaledMaximum) * 116,
  }));
  const healthPoints = items.map((service, index) => {
    const base = { healthy: 76, degraded: 122, offline: 166, unmonitored: 144 }[service.state] || 144;
    return { x: xFor(index), y: base + ((index % 3) - 1) * 9 };
  });
  const loadPoints = items.map((service, index) => ({
    x: xFor(index),
    y: 118 + Math.sin((index + 1) * 1.7) * 34 - (scaleValue(service.latencyMs || 0) / scaledMaximum) * 12,
  }));
  const pointString = (points) => points.map(({ x, y }) => `${x},${y}`).join(' ');

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
            <polygon className="chart-area" points={`${xStart},188 ${pointString(latencyPoints)} ${xEnd},188`} />
            <polyline className="chart-line chart-line-pink" points={pointString(healthPoints)} />
            <polyline className="chart-line chart-line-orange" points={pointString(loadPoints)} />
            <polyline className="chart-line chart-line-cyan" points={pointString(latencyPoints)} />
            {latencyPoints.map(({ x, y }, index) => (
              <g key={items[index].id || index}>
                <circle className="chart-dot-halo" cx={x} cy={y} r="5" />
                <circle className="chart-dot" cx={x} cy={y} r="2.5" />
              </g>
            ))}
          </svg>
          <div className="chart-labels" style={{ '--chart-columns': items.length }}>
            {items.map((service) => <span key={service.id}>{service.shortName || service.name}</span>)}
          </div>
        </>
      ) : (
        <div className="chart-empty"><LoaderCircle className="spin" size={18} /> 正在同步服务趋势</div>
      )}
    </div>
  );
}

function makeSparkline(service, index) {
  const seed = [...String(service.id || index)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const base = Math.max(service.latencyMs || 26, 8);
  return Array.from({ length: 5 }, (_, pointIndex) => (
    Math.max(8, base + (((seed + pointIndex * 17) % 23) - 11) * 0.9)
  ));
}

function ServicePortfolioRow({ service, index, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || Server;
  const meta = STATE_META[service.state] || STATE_META.unmonitored;
  const values = makeSparkline(service, index);
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

function ViewHeading({ eyebrow, title, description, children }) {
  return (
    <header className="view-heading">
      <div>
        <span className="view-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </header>
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
}) {
  const sortedServices = [...services].sort((left, right) => (
    (STATE_PRIORITY[left.state] ?? 4) - (STATE_PRIORITY[right.state] ?? 4)
    || left.name.localeCompare(right.name, 'zh-CN')
  ));

  return (
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
        <OperationsChart services={services} />
      </article>

      <article className="dashboard-card monitoring-card">
        <div>
          <span className="card-eyebrow">实时监测</span>
          <h2>{monitoringEnabled ? '自动监测已开启' : '自动监测已暂停'}</h2>
          <p>{monitoringEnabled ? '每 30 秒自动同步服务状态' : '可随时重新开启状态同步'}</p>
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
          {sortedServices.length > 0 ? sortedServices.map((service, index) => (
            <ServicePortfolioRow key={service.id} service={service} index={index} onLaunch={launchService} />
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
  );
}

function ApplicationsView({ services, loading, onLaunch }) {
  const applications = services.filter((service) => service.category === 'miniapp');
  const healthyApplications = applications.filter((service) => service.state === 'healthy').length;
  const availability = applications.length > 0 ? Math.round((healthyApplications / applications.length) * 100) : 0;

  return (
    <section className="page-view applications-view" aria-labelledby="applications-title">
      <ViewHeading
        eyebrow="应用"
        title="应用中心"
        description="统一管理面向用户的应用入口、运行状态与服务能力。"
      >
        <div className="view-heading-stats">
          <span><strong>{applications.length}</strong> 个应用</span>
          <span><strong>{availability}%</strong> 可用率</span>
        </div>
      </ViewHeading>

      <div className="applications-layout">
        <div className="application-catalog">
          <div className="section-bar">
            <div><h3>应用目录</h3><span>可直接进入已配置的管理端</span></div>
            <span className="section-count">{applications.length}</span>
          </div>
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
    <section className="page-view services-view" aria-labelledby="services-view-title">
      <ViewHeading
        eyebrow="运维"
        title="服务运维"
        description="集中查看基础服务健康度、响应时间和检查结果。"
      />

      <div className="operations-kpis">
        <article><span className="kpi-icon blue"><Server size={20} /></span><div><span>基础服务</span><strong>{infrastructure.length}</strong><small>已接入运维</small></div></article>
        <article><span className="kpi-icon green"><CheckCircle2 size={20} /></span><div><span>运行正常</span><strong>{healthy}</strong><small>当前在线</small></div></article>
        <article><span className="kpi-icon orange"><CircleAlert size={20} /></span><div><span>需要处理</span><strong>{attention}</strong><small>异常或离线</small></div></article>
        <article><span className="kpi-icon purple"><Activity size={20} /></span><div><span>在线平均</span><strong>{averageLatency === null ? '--' : averageLatency}</strong><small>{averageLatency === null ? '暂无数据' : '响应毫秒'}</small></div></article>
      </div>

      <div className="services-layout">
        <section className="view-card service-table-card">
          <header className="section-bar">
            <div><h3>基础服务清单</h3><span>状态数据来自实时健康检查</span></div>
            <span className="section-count">{infrastructure.length}</span>
          </header>
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

function AutomationView({ services, loading, refreshing, onRefresh, onLaunch }) {
  const automations = services.filter((service) => service.category === 'automation');
  const automation = automations[0];
  const meta = STATE_META[automation?.state] || STATE_META.unmonitored;
  const [ct8Data, setCt8Data] = useState({ stats: null, status: null, runs: [] });
  const [ct8Loading, setCt8Loading] = useState(true);
  const [ct8Refreshing, setCt8Refreshing] = useState(false);
  const [ct8Error, setCt8Error] = useState('');
  const [ct8Message, setCt8Message] = useState('');
  const [triggering, setTriggering] = useState(false);

  const loadCt8 = useCallback(async ({ quiet = false } = {}) => {
    quiet ? setCt8Refreshing(true) : setCt8Loading(true);
    setCt8Error('');

    try {
      const [statsResult, statusResult, runsResult] = await Promise.allSettled([
        requestJson(`${CT8_API_BASE}/ct8/stats`),
        requestJson(`${CT8_API_BASE}/github/status?limit=6`),
        requestJson(`${CT8_API_BASE}/ct8/runs?pageSize=6`),
      ]);

      const failures = [
        requestFailure(statsResult, '统计'),
        requestFailure(statusResult, '当前状态'),
        requestFailure(runsResult, '运行历史'),
      ].filter(Boolean);

      if (statsResult.status === 'fulfilled' && !hasCt8Payload(statsResult.value, 'stats')) failures.push('统计：未收到 CT8 数据');
      if (statusResult.status === 'fulfilled' && !hasCt8Payload(statusResult.value, 'status')) failures.push('当前状态：未收到 CT8 数据');
      if (runsResult.status === 'fulfilled' && !hasCt8Payload(runsResult.value, 'runs')) failures.push('运行历史：未收到 CT8 数据');

      const statsPayload = statsResult.status === 'fulfilled'
        ? (statsResult.value?.stats || statsResult.value?.data?.stats || null)
        : null;
      const statusPayload = statusResult.status === 'fulfilled'
        ? (statusResult.value?.data || null)
        : null;
      const historyRuns = runsResult.status === 'fulfilled'
        ? (runsResult.value?.runs || runsResult.value?.data?.runs || [])
        : [];
      const statusRuns = statusPayload?.runs || [];

      setCt8Data({
        stats: statsPayload,
        status: statusPayload,
        runs: collectCt8Runs(historyRuns, statusRuns),
      });

      if (failures.length > 0) {
        setCt8Error(`部分 CT8 数据未能加载：${failures.join('；')}`);
      }
    } catch (error) {
      setCt8Error(error.message || 'CT8 数据加载失败');
    } finally {
      setCt8Loading(false);
      setCt8Refreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && automation) loadCt8();
  }, [automation, loadCt8, loading]);

  const activeTask = ct8Data.status?.activeTask || null;
  const latestRun = ct8Data.status?.latest || ct8Data.runs[0] || null;
  const latestStatus = getCt8StatusMeta(latestRun?.status, latestRun?.workflow_conclusion);
  const activeStatus = getCt8StatusMeta(activeTask?.status || 'idle', activeTask?.workflow_conclusion);
  const taskRunning = activeStatus.className === 'running' || latestStatus.className === 'running';
  const ct8Ready = Boolean(ct8Data.stats || ct8Data.status || ct8Data.runs.length);
  const serviceState = ct8Ready ? 'healthy' : automation?.state;

  useEffect(() => {
    if (!taskRunning) return undefined;
    const interval = window.setInterval(() => loadCt8({ quiet: true }), 15000);
    return () => window.clearInterval(interval);
  }, [loadCt8, taskRunning]);

  function handleOpen(event) {
    if (!automation?.adminUrl || !isPlainInternalNavigation(event, automation.adminUrl)) return;
    event.preventDefault();
    onLaunch(automation);
  }

  async function handleRefresh() {
    setCt8Message('');
    await Promise.all([
      onRefresh?.(),
      loadCt8({ quiet: true }),
    ]);
  }

  async function handleTrigger() {
    setTriggering(true);
    setCt8Message('');
    setCt8Error('');
    try {
      await requestJson(`${CT8_API_BASE}/github/trigger`, {
        method: 'POST',
        body: JSON.stringify({ inputs: {} }),
      });
      setCt8Message('任务已提交到 GitHub Actions，正在等待运行结果回调。');
      await loadCt8({ quiet: true });
    } catch (error) {
      setCt8Error(error.message || '触发 CT8 任务失败');
    } finally {
      setTriggering(false);
    }
  }

  const stats = ct8Data.stats || {};
  const totalHosts = stats.totalHosts ?? latestRun?.total_accounts ?? latestRun?.stats?.total;
  const successHosts = stats.successHosts ?? latestRun?.success_count ?? latestRun?.stats?.success;
  const failedHosts = stats.failedHosts ?? latestRun?.failed_count ?? latestRun?.stats?.failed;
  const todayRuns = stats.todayRuns;
  const latestRunTime = stats.lastRunTime || getCt8RunTime(latestRun);
  const latestWorkflow = latestRun?.workflow || activeTask?.workflow || 'ssh-login.yml';
  const triggerDisabled = triggering || taskRunning || ct8Loading;

  return (
    <section className="page-view automation-view" aria-labelledby="automation-title">
      <ViewHeading
        eyebrow="自动化"
        title="自动化中心"
        description="查看自动化任务接入状态、执行能力与监测链路。"
      >
        <div className="automation-actions">
          <button className="secondary-action" type="button" onClick={handleRefresh} disabled={refreshing || ct8Refreshing}>
            {refreshing || ct8Refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
            {refreshing || ct8Refreshing ? '正在同步' : '刷新状态'}
          </button>
          <button className="primary-button" type="button" onClick={handleTrigger} disabled={triggerDisabled}>
            {triggering || taskRunning ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}
            {taskRunning ? '任务运行中' : '触发任务'}
          </button>
        </div>
      </ViewHeading>

      {loading ? (
        <div className="view-loading large"><LoaderCircle className="spin" size={22} /> 正在加载自动化服务</div>
      ) : automation ? (
        <>
          <article className={`automation-hero state-${meta.className}`}>
            <div className="automation-hero-icon"><Workflow size={29} /></div>
            <div className="automation-hero-copy">
              <span>自动化服务</span>
              <h3>{automation.name}</h3>
              <p>{automation.description}</p>
            </div>
            <ServiceStatus state={serviceState} />
            <div className="automation-hero-metrics">
              <div><span>今日运行</span><strong>{formatCount(todayRuns)}</strong></div>
              <div><span>最近结果</span><strong>{latestStatus.label}</strong></div>
              <div><span>最近运行</span><strong>{formatDateTime(latestRunTime)}</strong></div>
            </div>
            {automation.adminUrl && (
              <a
                href={automation.adminUrl}
                target={automation.adminUrl.startsWith('/') ? undefined : '_blank'}
                rel={automation.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
                onClick={handleOpen}
              >进入后台 <ArrowUpRight size={16} /></a>
            )}
          </article>

          {(ct8Error || ct8Message) && (
            <div className={`automation-feedback ${ct8Error ? 'error' : 'success'}`} role={ct8Error ? 'alert' : 'status'}>
              {ct8Error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
              <span>{ct8Error || ct8Message}</span>
            </div>
          )}

          <div className="automation-kpis">
            <article><span className="kpi-icon blue"><Timer size={20} /></span><div><span>今日运行</span><strong>{formatCount(todayRuns)}</strong><small>GitHub Actions 调度</small></div></article>
            <article><span className="kpi-icon green"><CheckCircle2 size={20} /></span><div><span>成功节点</span><strong>{formatCount(successHosts)}</strong><small>最近一次结果</small></div></article>
            <article><span className="kpi-icon orange"><CircleAlert size={20} /></span><div><span>失败节点</span><strong>{formatCount(failedHosts)}</strong><small>最近一次结果</small></div></article>
            <article><span className="kpi-icon purple"><Activity size={20} /></span><div><span>总节点</span><strong>{formatCount(totalHosts)}</strong><small>最近一次覆盖</small></div></article>
          </div>

          <div className="automation-layout">
            <section className="view-card ct8-runs-panel">
              <header><div><span className="view-eyebrow">历史</span><h3>运行历史</h3></div><Timer size={21} /></header>
              {ct8Loading ? (
                <div className="ct8-inline-loading"><LoaderCircle className="spin" size={18} /> 正在加载运行记录</div>
              ) : ct8Data.runs.length > 0 ? (
                <div className="ct8-runs-list">
                  {ct8Data.runs.map((run) => {
                    const runStatus = getCt8StatusMeta(run.status, run.workflow_conclusion);
                    return (
                      <div className="ct8-run-row" key={run.run_id || run.id || getCt8RunTime(run)}>
                        <div>
                          <strong>{run.workflow || 'ssh-login.yml'}</strong>
                          <span>{formatCt8RunId(run.run_id || run.id)} · {formatDateTime(getCt8RunTime(run))}</span>
                        </div>
                        <span className={`ct8-run-status ${runStatus.className}`}>{runStatus.label}</span>
                        <span>{formatCount(run.success_count ?? run.stats?.success)}</span>
                        <span>{formatCount(run.failed_count ?? run.stats?.failed)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ct8-inline-empty">暂无运行记录</div>
              )}
            </section>

            <div className="automation-side-stack">
              <section className="view-card ct8-status-panel">
                <header><div><span className="view-eyebrow">任务</span><h3>当前任务</h3></div>{taskRunning ? <LoaderCircle className="spin" size={21} /> : <Play size={21} />}</header>
                <div className="ct8-status-grid">
                  <div><span>任务状态</span><strong className={`ct8-run-status ${activeStatus.className}`}>{activeStatus.label}</strong></div>
                  <div><span>Workflow</span><strong>{latestWorkflow}</strong></div>
                  <div><span>最近 Run ID</span><strong>{formatCt8RunId(latestRun?.run_id || activeTask?.run_id)}</strong></div>
                  <div><span>检查时间</span><strong>{formatCheckedAt(automation.checkedAt)}</strong></div>
                </div>
                {activeTask?.html_url && (
                  <a className="ct8-external-link" href={activeTask.html_url} target="_blank" rel="noreferrer">
                    打开 GitHub 运行记录 <ArrowUpRight size={15} />
                  </a>
                )}
              </section>

              <section className="view-card observability-panel">
                <header><div><span className="view-eyebrow">观测</span><h3>接入链路</h3></div><Database size={21} /></header>
                <ol>
                  <li className="done"><span><CheckCircle2 size={17} /></span><div><strong>服务注册</strong><small>已接入统一服务控制台</small></div></li>
                  <li className="done"><span><CheckCircle2 size={17} /></span><div><strong>Core API</strong><small>通过平台内部身份访问 CT8 接口</small></div></li>
                  <li className={ct8Ready ? 'done' : 'pending'}><span>{ct8Ready ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}</span><div><strong>运行观测</strong><small>{ct8Ready ? '统计与历史已接入' : '等待读取运行数据'}</small></div></li>
                  <li className={automation.state === 'unmonitored' ? 'pending' : 'done'}><span>{automation.state === 'unmonitored' ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}</span><div><strong>健康探针</strong><small>{automation.state === 'unmonitored' ? 'GitHub Actions 无独立健康端点' : meta.label}</small></div></li>
                </ol>
              </section>
            </div>
          </div>
        </>
      ) : <div className="view-empty">暂无自动化服务</div>}
    </section>
  );
}

function BackupRecoveryView({ session }) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const loadBackupStatus = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setActionError('');
    try {
      const nextStatus = await requestJson('/api/backups/status');
      setStatusData(nextStatus);
      const statusJobs = nextStatus.jobs || [];
      const running = nextStatus.jobs?.find((job) => job.status === 'running') || null;
      setActiveJob((current) => {
        const currentMatch = current?.id ? statusJobs.find((job) => job.id === current.id) : null;
        if (current?.status === 'running') return currentMatch || current;
        return currentMatch || running || current;
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
    if (confirmText !== restoreConfirmText) {
      setActionError('确认短语不正确');
      return;
    }
    const accepted = window.confirm(`即将使用备份 ${selectedBackup.name} 覆写当前数据库。是否继续？`);
    if (!accepted) return;

    try {
      const result = await requestJson('/api/backups/restore', {
        method: 'POST',
        body: JSON.stringify({
          backupName: selectedBackup.name,
          password: restorePassword,
          confirmText,
        }),
      });
      setActiveJob(result.job);
      setRestorePassword('');
      setConfirmText('');
      setActionMessage('恢复任务已提交');
      await loadBackupStatus(true);
    } catch (error) {
      setActionError(error.message);
    }
  }

  const canUseRestore = Boolean(capabilities.canRestore && selectedBackup?.restorable && !runningJob);
  const executorHealthy = capabilities.canBackup && capabilities.canRestore;

  return (
    <section className="page-view backup-view" aria-labelledby="backup-view-title">
      <ViewHeading
        eyebrow="灾备"
        title="数据灾备"
        description="管理 MongoDB 全库归档、核心上传文件备份和高危恢复任务。"
      >
        <button className="secondary-action" type="button" onClick={() => loadBackupStatus(true)} disabled={refreshing}>
          {refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
          {refreshing ? '正在刷新' : '刷新清单'}
        </button>
      </ViewHeading>

      <div className="backup-kpis">
        <article><span className="kpi-icon blue"><Database size={20} /></span><div><span>可用备份</span><strong>{backups.filter((backup) => backup.restorable).length}</strong><small>服务器备份目录</small></div></article>
        <article><span className="kpi-icon green"><CheckCircle2 size={20} /></span><div><span>执行器</span><strong>{executorHealthy ? '就绪' : '受限'}</strong><small>{capabilities.issues?.join('，') || '可执行备份与恢复'}</small></div></article>
        <article><span className="kpi-icon orange"><Clock3 size={20} /></span><div><span>最近备份</span><strong>{formatDateTime(latestBackup?.createdAt)}</strong><small>{latestBackup?.name || '暂无归档'}</small></div></article>
        <article><span className="kpi-icon purple"><ShieldCheck size={20} /></span><div><span>恢复保护</span><strong>{session.authDisabled ? '确认短语' : '密码验证'}</strong><small>恢复前校验归档哈希</small></div></article>
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
            <span>备份会短暂停止业务容器，生成包含五个 MongoDB 数据库和核心上传文件的归档。</span>
          </div>
          <button
            className="primary-button backup-primary-action"
            type="button"
            onClick={handleStartBackup}
            disabled={!capabilities.canBackup || Boolean(runningJob)}
          >
            {runningJob?.type === 'backup' ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
            {runningJob?.type === 'backup' ? '正在备份' : '立即备份'}
          </button>
        </section>

        <section className="view-card backup-list-card">
          <header className="section-bar">
            <div><h3>备份清单</h3><span>{loading ? '正在读取' : `${backups.length} 个归档`}</span></div>
            <span className="section-count">{backups.filter((backup) => backup.restorable).length}</span>
          </header>
          <div className="backup-table-head">
            <span>备份</span><span>时间</span><span>大小</span><span>状态</span>
          </div>
          <div className="backup-table-body">
            {loading ? (
              <div className="view-loading"><LoaderCircle className="spin" size={20} /> 正在加载备份清单</div>
            ) : backups.length > 0 ? backups.map((backup) => (
              <button
                key={backup.name}
                className={`backup-row ${selectedBackup?.name === backup.name ? 'selected' : ''} ${backup.restorable ? '' : 'invalid'}`}
                type="button"
                onClick={() => setSelectedBackup(backup)}
              >
                <span><strong>{backup.name}</strong><small>{backup.includes?.join(' / ') || '清单不可读'}</small></span>
                <span>{formatDateTime(backup.createdAt)}</span>
                <span>{formatBytes(backup.sizeBytes)}</span>
                <span className={backup.restorable ? 'healthy' : 'degraded'}>{backup.restorable ? '可恢复' : '不可用'}</span>
              </button>
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
          {!session.authDisabled && (
            <label className="restore-field">
              <span>管理员密码</span>
              <input
                type="password"
                autoComplete="current-password"
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
                placeholder="当前平台登录密码"
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
            disabled={!canUseRestore || confirmText !== restoreConfirmText || (!session.authDisabled && !restorePassword)}
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
    </section>
  );
}

function Dashboard({ session, onLogout }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [data, setData] = useState(null);
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

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    if (window.matchMedia('(max-width: 980px)').matches) {
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  }, []);

  const loadServices = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setData(await requestJson(`/api/services/status${force ? '?refresh=1' : ''}`));
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
    const interval = window.setInterval(() => loadServices(true), 30000);
    return () => window.clearInterval(interval);
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
    automation: { title: '自动化中心', subtitle: '任务能力与观测链路' },
    backup: { title: '数据灾备', subtitle: '备份恢复与灾难演练' },
  }[activeFilter];

  return (
    <div className="app-shell">
      {launchingService && (
        <div className="navigation-transition" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={24} />
          <strong>正在进入{launchingService.shortName || launchingService.name}</strong>
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
            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                type="button"
                aria-label="查看系统通知"
                aria-expanded={notificationOpen}
                onClick={() => setNotificationOpen((open) => !open)}
              >
                <Bell size={19} />
                <i className={attentionCount > 0 ? 'attention' : ''} />
              </button>
              {notificationOpen && (
                <div className="notification-popover" role="status">
                  <strong>{attentionCount > 0 ? `${attentionCount} 项服务需要处理` : '系统运行平稳'}</strong>
                  <span>最近同步：{formatCheckedAt(data?.refreshedAt)}</span>
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
            />
          )}
          {activeFilter === 'miniapp' && <ApplicationsView services={services} loading={loading} onLaunch={launchService} />}
          {activeFilter === 'service' && <ServicesView services={services} loading={loading} onLaunch={launchService} />}
          {activeFilter === 'automation' && (
            <AutomationView
              services={services}
              loading={loading}
              refreshing={refreshing}
              onRefresh={() => loadServices(true)}
              onLaunch={launchService}
            />
          )}
          {activeFilter === 'backup' && <BackupRecoveryView session={session} />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const finishAuthentication = useCallback((nextSession) => {
    setSession(nextSession);
    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '';
    if (nextSession?.authenticated && /^\/apps\/(core|exam|campus|iot)(?:\/|$)/.test(returnTo)) {
      window.location.replace(returnTo);
    }
  }, []);

  useEffect(() => {
    requestJson('/api/auth/status')
      .then(finishAuthentication)
      .catch(() => setSession({ authenticated: false, authDisabled: false, user: null }))
      .finally(() => setCheckingSession(false));
  }, [finishAuthentication]);

  if (checkingSession) return <LoadingScreen />;
  if (!session?.authenticated) return <LoginScreen onAuthenticated={finishAuthentication} />;
  return <Dashboard session={session} onLogout={() => setSession({ authenticated: false, authDisabled: false, user: null })} />;
}
