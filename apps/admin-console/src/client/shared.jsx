import {
  AppWindow,
  Bell,
  Bot,
  Boxes,
  CheckCircle2,
  ChartNoAxesCombined,
  CircleAlert,
  CircleOff,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Component } from 'react';
import { reportConsoleExperience } from './experience.js';
import { PLATFORM_BRAND_ICON } from './brand.js';

export const NAVIGATION_ICONS = {
  overview: LayoutDashboard,
  services: Boxes,
  observability: ChartNoAxesCombined,
  execution: ListTodo,
  capabilities: Zap,
  security: ShieldCheck,
};

export const CATEGORY_LABELS = {
  miniapp: '应用',
  service: '服务',
  automation: '自动化',
};

export const SERVICE_ICONS = {
  core: Boxes,
  exam: GraduationCap,
  campus: AppWindow,
  mqtt: Radio,
  notify: Bell,
  'ct8-automation': Bot,
  platform: ShieldCheck,
};

export const STATE_META = {
  healthy: { label: '运行正常', shortLabel: '在线', className: 'healthy', icon: CheckCircle2 },
  degraded: { label: '响应异常', shortLabel: '异常', className: 'degraded', icon: CircleAlert },
  offline: { label: '暂不可用', shortLabel: '离线', className: 'offline', icon: CircleOff },
  unmonitored: { label: '尚未检查', shortLabel: '未检查', className: 'unmonitored', icon: Clock3 },
};

export const STATE_PRIORITY = {
  offline: 0,
  degraded: 1,
  unmonitored: 2,
  healthy: 3,
};

export function ViewLoadingFallback() {
  return (
    <div className="view-loading large" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={22} />
      <span>正在加载功能模块</span>
    </div>
  );
}

export class ViewModuleBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error('Console view failed to load', error, details);
    void reportConsoleExperience({ event: 'ui_error', error });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-banner view-module-error" role="alert">
        <CircleAlert size={18} />
        <span>功能模块加载失败，请检查网络后重新加载。</span>
        <button type="button" onClick={() => window.location.reload()}>重新加载页面</button>
      </div>
    );
  }
}

export function hasRole(role, required) {
  const levels = { viewer: 1, operator: 2, super_admin: 3 };
  return (levels[role] || 0) >= (levels[required] || 0);
}

export function formatCheckedAt(value) {
  if (!value) return '尚未检查';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return '暂无';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function formatBytes(value) {
  const size = Number(value || 0);
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}
export function LoadingScreen() {
  return (
    <main className="loading-screen">
      <span className="brand-mark" aria-hidden="true">
        <img src={PLATFORM_BRAND_ICON} alt="" />
      </span>
      <div>
        <strong>统一服务控制台</strong>
        <span><LoaderCircle className="spin" size={15} /> 正在连接服务</span>
      </div>
    </main>
  );
}

export function SessionUnavailableScreen({ error, onRetry, retrying }) {
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
export function ServiceStatus({ state }) {
  const meta = STATE_META[state] || STATE_META.unmonitored;
  const Icon = meta.icon;
  return (
    <span className={`service-status ${meta.className}`}>
      <Icon size={14} />
      {meta.label}
    </span>
  );
}
